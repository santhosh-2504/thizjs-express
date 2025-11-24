import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Load and manage middleware for THIZ routes
 */
export class MiddlewareLoader {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.middlewaresDir = path.resolve(projectRoot, "src", "middlewares");
    this.middlewareCache = new Map();
    this.globalMiddlewares = [];
    this.loaded = false;
  }

  /**
   * Check if middlewares directory exists
   */
  hasMiddlewaresDir() {
    return fs.existsSync(this.middlewaresDir);
  }

  /**
   * Import a middleware file (supports .js and .ts)
   */
  async importMiddleware(filePath) {
    const ext = path.extname(filePath);

    if (ext === ".ts") {
      // Check if tsx is available
      try {
        const { tsImport } = await import("tsx/esm/api");
        const fileUrl = pathToFileURL(filePath).href;
        return await tsImport(fileUrl, import.meta.url);
      } catch {
        throw new Error(
          `Cannot load TypeScript middleware: ${filePath}\n` +
          `TypeScript support requires 'tsx' package.\n` +
          `Install it with: npm install -D tsx`
        );
      }
    } else {
      // Regular JavaScript file
      const fileUrl = pathToFileURL(filePath).href;
      return await import(fileUrl);
    }
  }

  /**
   * Load all middlewares from src/middlewares/
   */
  async loadMiddlewares() {
    if (this.loaded) return;

    if (!this.hasMiddlewaresDir()) {
      console.log("No middlewares directory found. Skipping middleware loading.");
      this.loaded = true;
      return;
    }

    const files = fs.readdirSync(this.middlewaresDir);

    for (const file of files) {
      const filePath = path.join(this.middlewaresDir, file);
      const stat = fs.statSync(filePath);

      // Skip directories
      if (stat.isDirectory()) continue;

      // Only process .js and .ts files
      if (!/\.(js|ts)$/.test(file)) continue;

      // Extract middleware name and check if it's global
      const isGlobal = file.includes("._global.");
      const middlewareName = file
        .replace(/\._global/, "")
        .replace(/\.(js|ts)$/, "");

      try {
        const module = await this.importMiddleware(filePath);
        const middleware = module.default || module.middleware;

        if (!middleware || typeof middleware !== "function") {
          throw new Error(
            `Middleware '${file}' must export a default function or named 'middleware' function`
          );
        }

        // Store in cache
        this.middlewareCache.set(middlewareName, middleware);

        // Add to global list if it's a global middleware
        if (isGlobal) {
          this.globalMiddlewares.push({
            name: middlewareName,
            fn: middleware,
          });
          console.log(`Loaded global middleware: ${middlewareName}`);
        } else {
          console.log(`Loaded middleware: ${middlewareName}`);
        }
      } catch (error) {
        console.error(`Failed to load middleware '${file}':`, error.message);
        throw error;
      }
    }

    // Sort global middlewares alphabetically for consistent order
    this.globalMiddlewares.sort((a, b) => a.name.localeCompare(b.name));

    this.loaded = true;
  }

  /**
   * Resolve middlewares for a route based on the middlewares array
   * 
   * @param {string[]} routeMiddlewares - Array from route file
   * @returns {Function[]} - Array of Express middleware functions
   */
  resolveMiddlewares(routeMiddlewares) {
    // If no middlewares specified, return only globals
    if (!routeMiddlewares || routeMiddlewares.length === 0) {
      return this.globalMiddlewares.map((mw) => mw.fn);
    }

    // Check if route wants to skip globals
    const skipGlobals = routeMiddlewares.includes("!_global");

    // Filter out the !_global marker
    const requestedMiddlewares = routeMiddlewares.filter(
      (name) => name !== "!_global"
    );

    const result = [];

    // Add globals first (unless skipped)
    if (!skipGlobals) {
      result.push(...this.globalMiddlewares.map((mw) => mw.fn));
    }

    // Add route-specific middlewares
    for (const name of requestedMiddlewares) {
      if (!this.middlewareCache.has(name)) {
        throw new Error(
          `Middleware '${name}' not found in src/middlewares/\n` +
          `Available middlewares: ${Array.from(this.middlewareCache.keys()).join(", ")}`
        );
      }

      result.push(this.middlewareCache.get(name));
    }

    return result;
  }

  /**
   * Get list of available middlewares (for debugging)
   */
  getAvailableMiddlewares() {
    return {
      global: this.globalMiddlewares.map((mw) => mw.name),
      available: Array.from(this.middlewareCache.keys()),
    };
  }
}