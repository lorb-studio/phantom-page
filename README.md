<p align="center">
  <img src=".github/icon.png" width="80" height="80" alt="phantom-page" />
</p>

<h1 align="center">phantom-page</h1>
<p align="center">Pages that don't exist until you click them.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lorb/phantom-page"><code>npm install @lorb/phantom-page</code></a>
</p>

**No server.** Routes live in the browser. A Service Worker intercepts navigation and generates HTML on the fly — styled, dynamic, instant.

**No files.** No static HTML to maintain. Define routes in JavaScript, and pages materialize at the moment of navigation.

**No build step.** Works with any framework or vanilla JS. Drop it in and links start working.

```js
import { init } from '@lorb/phantom-page';

init({
  routes: {
    '/hello': () => `<html><body><h1>Hi.</h1></body></html>`,
  },
});
// Click a link to /hello → the page appears. It never existed before.
```

## Install

```bash
npm install @lorb/phantom-page
```

## What you can do

### Style pages with CSS

Handlers return full HTML — include any CSS you want.

```js
init({
  routes: {
    '/about': () => `
      <html>
      <head>
        <style>
          body { font-family: system-ui; background: #0a0a0a; color: #fafafa; }
          h1 { font-size: 4rem; font-weight: 200; letter-spacing: -0.02em; }
          .container { max-width: 640px; margin: 0 auto; padding: 4rem 2rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>About</h1>
          <p>This page was generated at ${new Date().toLocaleTimeString()}.</p>
        </div>
      </body>
      </html>
    `,
  },
});
```

### Dynamic pages with route params

`:param` captures URL segments. Use them to generate content.

```js
init({
  routes: {
    '/user/:id': ({ id }) => `
      <html><body>
        <h1>Profile #${id}</h1>
        <p>Generated on the fly — no database, no server.</p>
      </body></html>
    `,

    '/post/:slug': ({ slug }) => `
      <html><body>
        <h1>${slug.replace(/-/g, ' ')}</h1>
      </body></html>
    `,
  },
});
```

### Catch-all routes with wildcards

```js
init({
  routes: {
    '/docs/*': () => `
      <html><body>
        <h1>Documentation</h1>
        <p>Every /docs/* URL resolves to this page.</p>
      </body></html>
    `,
  },
});
```

### Serve JSON or any content type

Return a `Response` object for full control over headers and status codes.

```js
init({
  routes: {
    '/api/time': () => new Response(
      JSON.stringify({ time: Date.now() }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
    '/api/redirect': () => new Response(null, {
      status: 302,
      headers: { Location: '/hello' },
    }),
  },
});
```

### Wait for readiness before navigating

The Service Worker needs a moment to activate. Use `waitUntilReady()` if you navigate programmatically.

```js
import { init, waitUntilReady } from '@lorb/phantom-page';

init({ routes: { /* ... */ } });
await waitUntilReady();
window.location.href = '/hello'; // Safe — route is active
```

## Browser compatibility

By default, phantom-page creates a Service Worker from a blob URL. This works in **Chrome and Edge** but throws `SecurityError` in Firefox and Safari.

For cross-browser support, use the `swUrl` option to register a real Service Worker file:

```js
import { init, generateSWScript } from '@lorb/phantom-page';

// 1. Generate the SW script at build time and write it to a file:
const script = generateSWScript(
  { '/hello': () => `<html><body><h1>Hi.</h1></body></html>` },
);
// Write `script` to your public directory as `phantom-sw.js`

// 2. Point init() to the file:
init({
  routes: { '/hello': () => `<html><body><h1>Hi.</h1></body></html>` },
  swUrl: '/phantom-sw.js',
});
```

You can also check support at runtime:

```js
import { init, isSupported } from '@lorb/phantom-page';

if (isSupported()) {
  // Blob URL approach — Chrome/Edge only
  init({ routes: { /* ... */ } });
} else {
  // Fall back to swUrl approach
  init({ routes: { /* ... */ }, swUrl: '/phantom-sw.js' });
}
```

| Browser | Default (blob URL) | With `swUrl` |
|---------|-------------------|-------------|
| Chrome / Edge | Full support | Full support |
| Firefox | Not supported | Full support |
| Safari | Not supported | Full support |

## Constraints

- **Handlers must be self-contained.** They run inside a Service Worker via `toString()` serialization — closures and external imports won't work. phantom-page validates this at init and throws if a handler references outside scope.
- Same-origin only (Service Worker limitation).
- SSR-safe — no-op without `navigator.serviceWorker`.

## API

| Export | Description |
|--------|-------------|
| `init(config)` | Register routes. Returns async `destroy()` function |
| `waitUntilReady()` | Resolves when the Service Worker is active and controlling the page |
| `destroy()` | Unregister the Service Worker |
| `isSupported()` | Check if blob URL SW registration works in this browser |
| `generateSWScript(routes, fallback?)` | Generate the Service Worker script string (for the `swUrl` approach) |

**Config options:**

| Option | Type | Description |
|--------|------|-------------|
| `routes` | `Record<string, RouteHandler>` | Route pattern to handler map |
| `fallback` | `string` | URL to redirect to on handler errors |
| `swUrl` | `string` | Path to a pre-built SW file (required for Firefox/Safari) |

**Route patterns:** `/path`, `/path/:param`, `/path/*`

## License

𖦹 MIT — [Lorb.studio](https://lorb.studio)
