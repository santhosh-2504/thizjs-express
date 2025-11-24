import type { RequestHandler } from 'express';

/**
 * Information about available middlewares
 */
export interface AvailableMiddlewares {
  /**
   * List of global middleware names (auto-applied to all routes)
   */
  global: string[];

  /**
   * List of all available middleware names
   */
  available: string[];
}

/**
 * Loads and manages middleware for THIZ routes
 */
export class MiddlewareLoader {
  /**
   * @param projectRoot - Root directory of the project
   */
  constructor(projectRoot: string);

  /**
   * Check if middlewares directory exists
   */
  hasMiddlewaresDir(): boolean;

  /**
   * Load all middlewares from src/middlewares/
   * 
   * Middleware files:
   * - `checkAuth.js` - Named middleware (use in routes)
   * - `logIP._global.js` - Global middleware (auto-applied)
   */
  loadMiddlewares(): Promise<void>;

  /**
   * Resolve middlewares for a route based on the middlewares array
   * 
   * @param routeMiddlewares - Array of middleware names from route file
   * @returns Array of Express middleware functions
   * 
   * @example
   * // Use only global middlewares
   * resolveMiddlewares([])
   * 
   * @example
   * // Skip globals, use only route-specific
   * resolveMiddlewares(['!_global', 'checkAuth'])
   * 
   * @example
   * // Use globals + route-specific
   * resolveMiddlewares(['checkAuth', 'validateInput'])
   */
  resolveMiddlewares(routeMiddlewares?: string[]): RequestHandler[];

  /**
   * Get list of available middlewares (for debugging)
   */
  getAvailableMiddlewares(): AvailableMiddlewares;
}