import { generateSWScript } from './sw-generator.js';

export { generateSWScript } from './sw-generator.js';

export type RouteHandler = (
  params: Record<string, string>,
) => string | Response | Promise<string | Response>;

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

function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator
  );
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
export function isSupported(): boolean {
  if (!isBrowser()) return false;

  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return false;
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return false;

  return true;
}

function waitForActivation(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const sw = registration.installing || registration.waiting || registration.active;
    if (!sw) {
      resolve();
      return;
    }
    if (sw.state === 'activated') {
      resolve();
      return;
    }
    sw.addEventListener('statechange', function onStateChange() {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', onStateChange);
        resolve();
      }
    });
  });
}

export async function registerSW(
  config: PhantomConfig,
): Promise<ServiceWorkerRegistration | null> {
  if (!isBrowser()) return null;

  // When swUrl is provided, register from a real file (works in all browsers)
  if (config.swUrl) {
    const registration = await navigator.serviceWorker.register(config.swUrl, {
      scope: '/',
    });
    await waitForActivation(registration);
    return registration;
  }

  // Blob URL approach — Chrome/Edge only
  if (!isSupported()) {
    throw new Error(
      'phantom-page: This browser does not support blob URL Service Worker registration. ' +
      'Use the `swUrl` option to point to a pre-built SW file. ' +
      'Generate it with `generateSWScript(routes, fallback)` and serve it from your web server.',
    );
  }

  const script = generateSWScript(config.routes, config.fallback);
  const blob = new Blob([script], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    const registration = await navigator.serviceWorker.register(url, {
      scope: '/',
    });
    await waitForActivation(registration);
    URL.revokeObjectURL(url);
    return registration;
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

let activeRegistration: ServiceWorkerRegistration | null = null;
let registrationReady: Promise<void> | null = null;

/**
 * Resolves when the phantom-page Service Worker is activated and controlling the page.
 * Call after init() to ensure route interception is active before navigating.
 */
export async function waitUntilReady(): Promise<void> {
  if (registrationReady) await registrationReady;
  if (!isBrowser()) return;

  if (navigator.serviceWorker.controller) return;

  return new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => resolve(),
      { once: true },
    );
  });
}

export async function destroy(): Promise<boolean> {
  if (registrationReady) await registrationReady;
  if (!activeRegistration) return false;
  const result = await activeRegistration.unregister();
  activeRegistration = null;
  registrationReady = null;
  return result;
}

export function init(config: PhantomConfig): () => Promise<boolean> {
  if (!isBrowser()) return () => Promise.resolve(false);

  registrationReady = registerSW(config).then((reg) => {
    activeRegistration = reg;
  });

  return destroy;
}
