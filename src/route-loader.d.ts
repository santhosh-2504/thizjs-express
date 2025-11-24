import type { Application, RequestHandler } from 'express';

/**
 * Options for configuring route registration behavior.
 */
export interface RegisterRoutesOptions {
  /**
   * Prefix to add to all registered routes.
   * @example "/api" → all routes will be prefixed with /api
   * @default ""
   */
  prefix?: string;

  /**
   * If true, throws an error when dynamic route conflicts are detected.
   * If false, logs a warning instead.
   * @default false
   */
  strict?: boolean;
}

/**
 * Valid HTTP methods supported by the route loader.
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Structure of a route handler module.
 * Modules must export either a default export or a named 'handler' export.
 */
export interface RouteHandlerModule {
  default?: RequestHandler;
  handler?: RequestHandler;
}

/**
 * Register file-based routes using folder-based method mapping.
 *
 * @param app - Express application instance
 * @param routesDir - Directory containing route files (relative to src/)
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { registerRoutes } from '@thizjs/express';
 *
 * const app = express();
 *
 * await registerRoutes(app, 'routes', {
 *   prefix: '/api',
 *   strict: true
 * });
 * ```
 *
 * @example Route file structure:
 * ```
 * routes/product/add-product/POST.js → POST /product/add-product
 * routes/product/get/[id]/GET.js     → GET /product/get/:id
 * ```
 *
 * @throws {Error} If routes directory does not exist
 * @throws {Error} If strict mode is enabled and dynamic route conflicts are detected
 */
export function registerRoutes(
  app: Application,
  routesDir?: string,
  options?: RegisterRoutesOptions
): Promise<void>;