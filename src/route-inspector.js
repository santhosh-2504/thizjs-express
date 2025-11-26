import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { MiddlewareLoader } from "./middleware-loader.js";

/**
 * Enhanced route registration with introspection support
 * Returns metadata about all registered routes and middlewares
 */
export async function inspectRoutes(routesDir = "routes", options = {}) {
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

  const routes = [];
  const routeRegistry = new Map();
  const fileRegistry = new Map();

  function normalizeDynamic(p) {
    return p.replace(/:\w+/g, ":param");
  }

  // Check tsx availability
  let tsxAvailable = false;
  try {
    await import("tsx/esm/api");
    tsxAvailable = true;
  } catch {
    tsxAvailable = false;
  }

  async function importModule(filePath) {
    const ext = path.extname(filePath);

    if (ext === ".ts") {
      if (!tsxAvailable) {
        throw new Error(
          `Cannot load TypeScript route file: ${filePath}\n` +
          `TypeScript support requires 'tsx' package.`
        );
      }

      const fileUrl = pathToFileURL(filePath).href;
      const { tsImport } = await import("tsx/esm/api");
      return await tsImport(fileUrl, import.meta.url);
    } else {
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

      const methodMatch = item.name.match(
        /^(GET|POST|PUT|PATCH|DELETE)\.(js|ts)$/i
      );
      if (!methodMatch) continue;

      const method = methodMatch[1].toLowerCase();
      const fileExt = methodMatch[2];

      const processedPath = prefixPath.replace(/\[(.+?)\]/g, ":$1");
      const routePath = `${normalizedPrefix}${processedPath}`
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/");

      const routeSignature = `${method}:${routePath}`;

      if (fileRegistry.has(routeSignature)) {
        const existingFile = fileRegistry.get(routeSignature);
        const existingExt = path.extname(existingFile);
        const currentExt = `.${fileExt}`;

        if (existingExt !== currentExt) {
          throw new Error(
            `File extension conflict: ${existingFile} vs ${fullPath}`
          );
        }
      }

      const fingerprint = `${method}:${normalizeDynamic(routePath)}`;

      if (routeRegistry.has(fingerprint)) {
        const prev = routeRegistry.get(fingerprint);
        const msg = `Dynamic route conflict: ${prev} vs ${fullPath}`;
        if (strict) throw new Error(msg);
        else console.warn(msg);
      } else {
        routeRegistry.set(fingerprint, fullPath);
      }

      fileRegistry.set(routeSignature, fullPath);

      try {
        const handlerModule = await importModule(fullPath);
        const routeMiddlewares = handlerModule.middlewares || [];

        if (!Array.isArray(routeMiddlewares)) {
          throw new Error(
            `Invalid middlewares export in ${fullPath}`
          );
        }

        const middlewares = middlewareLoader.resolveMiddlewares(routeMiddlewares);
        
        // Get middleware names for display
        const middlewareNames = [];
        
        // Add global middlewares
        const skipGlobals = routeMiddlewares.includes("!_global");
        if (!skipGlobals) {
          middlewareLoader.globalMiddlewares.forEach(mw => {
            middlewareNames.push({
              name: mw.name,
              type: "global",
            });
          });
        }

        // Add route-specific middlewares
        routeMiddlewares
          .filter(name => name !== "!_global")
          .forEach(name => {
            middlewareNames.push({
              name,
              type: "route",
            });
          });

        // Build route metadata
        routes.push({
          method: method.toUpperCase(),
          path: routePath,
          file: path.relative(projectRoot, fullPath),
          fileType: fileExt === "ts" ? "TypeScript" : "JavaScript",
          middlewares: middlewareNames,
          handler: handlerModule.default ? "default" : "handler",
        });

      } catch (error) {
        console.error(`Failed to load route: ${fullPath}`);
        throw error;
      }
    }
  }

  await walk(baseDir);

  // Get middleware info
  const middlewareInfo = middlewareLoader.getAvailableMiddlewares();

  return {
    routes: routes.sort((a, b) => {
      // Sort by method, then path
      if (a.method !== b.method) {
        const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"];
        return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method);
      }
      return a.path.localeCompare(b.path);
    }),
    middlewares: {
      global: middlewareInfo.global,
      available: middlewareInfo.available,
    },
    summary: {
      totalRoutes: routes.length,
      totalMiddlewares: middlewareInfo.available.length,
      globalMiddlewares: middlewareInfo.global.length,
      byMethod: routes.reduce((acc, route) => {
        acc[route.method] = (acc[route.method] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}