export { generateSWScript } from './sw-generator.js';
export type RouteHandler = (params: Record<string, string>) => string | Response | Promise<string | Response>;
export interface PhantomConfig {
    routes: Record<string, RouteHandler>;
    fallback?: string;
    /**
     * URL of a pre-built Service Worker file to register.
     * When provided, phantom-page registers this URL directly instead of
     * creating a blob URL. This is required for Firefox and Safari, which
     * reject blob URL Service Worker registration with SecurityError.
     *
     * Generate the file content with `generateSWScript()` and serve it
     * from your web server at this path.
     */
    swUrl?: string;
}
/**
 * Check if the current browser supports blob URL Service Worker registration.
 * Returns false in non-browser environments (SSR/Node), and in browsers
 * that reject blob URLs for SW registration (Firefox, Safari).
 *
 * When this returns false, use the `swUrl` option in `init()` to point
 * to a real Service Worker file instead.
 *
 * Browser compatibility:
 * - Chrome/Edge: full support (blob URL works)
 * - Firefox: requires `swUrl` (blob URL throws SecurityError)
 * - Safari: requires `swUrl` (blob URL throws SecurityError)
 */
export declare function isSupported(): boolean;
export declare function registerSW(config: PhantomConfig): Promise<ServiceWorkerRegistration | null>;
/**
 * Resolves when the phantom-page Service Worker is activated and controlling the page.
 * Call after init() to ensure route interception is active before navigating.
 */
export declare function waitUntilReady(): Promise<void>;
export declare function destroy(): Promise<boolean>;
export declare function init(config: PhantomConfig): () => Promise<boolean>;
