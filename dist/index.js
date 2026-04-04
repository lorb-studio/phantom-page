import { generateSWScript } from './sw-generator.js';
export { generateSWScript } from './sw-generator.js';
function isBrowser() {
    return (typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator);
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
export function isSupported() {
    if (!isBrowser())
        return false;
    const ua = navigator.userAgent;
    if (/Firefox\//i.test(ua))
        return false;
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua))
        return false;
    return true;
}
function waitForActivation(registration) {
    return new Promise((resolve) => {
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
export async function registerSW(config) {
    if (!isBrowser())
        return null;
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
        throw new Error('phantom-page: This browser does not support blob URL Service Worker registration. ' +
            'Use the `swUrl` option to point to a pre-built SW file. ' +
            'Generate it with `generateSWScript(routes, fallback)` and serve it from your web server.');
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
    }
    catch (err) {
        URL.revokeObjectURL(url);
        throw err;
    }
}
let activeRegistration = null;
let registrationReady = null;
/**
 * Resolves when the phantom-page Service Worker is activated and controlling the page.
 * Call after init() to ensure route interception is active before navigating.
 */
export async function waitUntilReady() {
    if (registrationReady)
        await registrationReady;
    if (!isBrowser())
        return;
    if (navigator.serviceWorker.controller)
        return;
    return new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
}
export async function destroy() {
    if (registrationReady)
        await registrationReady;
    if (!activeRegistration)
        return false;
    const result = await activeRegistration.unregister();
    activeRegistration = null;
    registrationReady = null;
    return result;
}
export function init(config) {
    if (!isBrowser())
        return () => Promise.resolve(false);
    registrationReady = registerSW(config).then((reg) => {
        activeRegistration = reg;
    });
    return destroy;
}
