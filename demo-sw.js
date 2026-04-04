"use strict";
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const ROUTES = [
  {
    "pattern": "/idea/:id",
    "regex": "^\\/idea\\/([^/]+)$",
    "keys": ["id"],
    "handler": "({ id }) => `<!DOCTYPE html><html><head><title>Idea #${id}</title></head><body style=\"font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem\"><h1>Idea #${id}</h1><p>This page was born the moment you clicked.</p><a href=\"/demo.html\">Back to demo</a></body></html>`"
  },
  {
    "pattern": "/random",
    "regex": "^\\/random$",
    "keys": [],
    "handler": "() => `<!DOCTYPE html><html><head><title>Random</title></head><body style=\"font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem\"><h1>${Math.random().toString(36).slice(2)}</h1><p>Generated on demand. Refresh for a different value.</p><a href=\"/demo.html\">Back to demo</a></body></html>`"
  }
];
const FALLBACK = null;

function matchRoute(pathname) {
  for (const route of ROUTES) {
    const regex = new RegExp(route.regex);
    const m = pathname.match(regex);
    if (!m) continue;
    const params = {};
    for (let i = 0; i < route.keys.length; i++) {
      params[route.keys[i]] = decodeURIComponent(m[i + 1]);
    }
    return { params, handler: route.handler };
  }
  return null;
}

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  const url = new URL(event.request.url);
  const result = matchRoute(url.pathname);
  if (!result) return;

  event.respondWith(
    (async () => {
      try {
        const fn = new Function("return (" + result.handler + ")")();
        const output = await fn(result.params);
        if (output instanceof Response) return output;
        return new Response(String(output), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (e) {
        if (FALLBACK) return Response.redirect(FALLBACK, 302);
        return new Response("phantom-page: generator error", { status: 500 });
      }
    })()
  );
});
