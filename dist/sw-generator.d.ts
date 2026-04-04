import type { RouteHandler } from './index.js';
/**
 * Validate that a route handler is self-contained (no closure references).
 * Handlers are serialized via toString() and reconstructed in a Service Worker
 * where closure variables are not available.
 */
export declare function validateHandler(pattern: string, handler: RouteHandler): void;
export declare function generateSWScript(routes: Record<string, RouteHandler>, fallback?: string): string;
