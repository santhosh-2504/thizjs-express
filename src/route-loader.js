import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { MiddlewareLoader } from "./middleware-loader.js";

/**
 * Register file-based routes using folder-based method mapping.
 * Supports both .js and .ts route files with middleware support.
 *
 * Example:
 *   routes/product/add-product/POST.js → POST /product/add-product
 *   routes/product/get/[id]/GET.ts     → GET /product/get/:id
 */
export async function registerRoutes(app, routesDir = "routes", options = {}) {
  const { prefix = "", strict = false } = options;

  const normalizedPrefix = prefix.replace(/\/+$/, "");
  const projectRoot = process.cwd();
  const baseDir = path.resolve(projectRoot, "src", routesDir);

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Routes directory not found: ${baseDir}`);
  }

  // Initialize middleware loader
  const middlewareLoader = new MiddlewareLoader(projectRoot);
  await middlewareLoader.loadMiddlewares();

  const routeRegistry = new Map();
  const fileRegistry = new Map();

  function normalizeDynamic(p) {
    return p.replace(/:\w+/g, ":param");
  }

  /**
   * Check if tsx is available for TypeScript support
   */
  let tsxAvailable = false;
  try {
    await import("tsx/esm/api");
    tsxAvailable = true;
  } catch {
    tsxAvailable = false;
  }

  /**
   * Import a module with TypeScript support if available
   */
  async function importModule(filePath) {
    const ext = path.extname(filePath);

    if (ext === ".ts") {
      if (!tsxAvailable) {
        throw new Error(
          `Cannot load TypeScript route file: ${filePath}\n\n` +
          `TypeScript support requires 'tsx' package.\n` +
          `Install it with: npm install -D tsx\n\n` +
          `Alternatively, transpile your .ts files to .js before running.`
        );
      }

      // Convert to file:// URL for cross-platform support
      const fileUrl = pathToFileURL(filePath).href;
      
      // Use tsx to load TypeScript files
      const { tsImport } = await import("tsx/esm/api");
      return await tsImport(fileUrl, import.meta.url);
    } else {
      // Regular JavaScript file
      const fileUrl = pathToFileURL(filePath).href;
      return await import(fileUrl);
    }
  }

  async function walk(currentDir, prefixPath = "") {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        await walk(fullPath, `${prefixPath}/${item.name}`);
        continue;
      }

      // Method files: GET.js, POST.ts, DELETE.js, etc.
      const methodMatch = item.name.match(
        /^(GET|POST|PUT|PATCH|DELETE)\.(js|ts)$/i
      );
      if (!methodMatch) continue;

      const method = methodMatch[1].toLowerCase();
      const fileExt = methodMatch[2];

      // Convert folders like [id] → :id
      const processedPath = prefixPath.replace(/\[(.+?)\]/g, ":$1");

      // Build final route
      const routePath = `${normalizedPrefix}${processedPath}`
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/");

      // Create unique route signature
      const routeSignature = `${method}:${routePath}`;

      // Check for .js/.ts file conflicts for the same route
      if (fileRegistry.has(routeSignature)) {
        const existingFile = fileRegistry.get(routeSignature);
        const existingExt = path.extname(existingFile);
        const currentExt = `.${fileExt}`;

        // If different extensions but same route
        if (existingExt !== currentExt) {
          const msg = `
File extension conflict detected!

Files:
→ ${existingFile}
→ ${fullPath}

Both resolve to: [${method.toUpperCase()}] ${routePath}

You cannot have both .js and .ts files for the same route.
Please keep only one version.
          `.trim();

          throw new Error(msg);
        }
      }

      // Detect dynamic route conflicts (e.g., [id] vs [slug])
      const fingerprint = `${method}:${normalizeDynamic(routePath)}`;

      if (routeRegistry.has(fingerprint)) {
        const prev = routeRegistry.get(fingerprint);

        const msg = `
Dynamic route conflict detected!

Files:
→ ${prev}
→ ${fullPath}

Both resolve to: [${method.toUpperCase()}] ${routePath}
        `.trim();

        if (strict) throw new Error(msg);
        else console.warn("\n" + msg + "\n");
      } else {
        routeRegistry.set(fingerprint, fullPath);
      }

      // Register the file for this route
      fileRegistry.set(routeSignature, fullPath);

      // Import handler (with TypeScript support)
      try {
        const handlerModule = await importModule(fullPath);

        const handler =
          handlerModule.default ||
          handlerModule.handler ||
          (() => {
            throw new Error(`No handler exported in ${fullPath}`);
          });

        // Resolve middlewares for this route
        const routeMiddlewares = handlerModule.middlewares || [];
        
        // Validate middlewares is an array
        if (!Array.isArray(routeMiddlewares)) {
          throw new Error(
            `Invalid middlewares export in ${fullPath}\n` +
            `Expected an array, got ${typeof routeMiddlewares}`
          );
        }

        const middlewares = middlewareLoader.resolveMiddlewares(routeMiddlewares);

        // Register route with middlewares
        app[method](routePath, ...middlewares, handler);

        const fileType = fileExt === "ts" ? "TS" : "JS";
        const mwCount = middlewares.length;
        const mwInfo = mwCount > 0 ? ` [${mwCount} middleware${mwCount > 1 ? 's' : ''}]` : '';
        
        console.log(
          `Loaded route: [${method.toUpperCase()}] ${routePath} (${fileType})${mwInfo}`
        );
      } catch (error) {
        console.error(`Failed to load route: ${fullPath}`);
        throw error;
      }
    }
  }

  await walk(baseDir);
}