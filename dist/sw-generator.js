import { compilePattern } from './matcher.js';
/* Identifiers safe to reference inside a Service Worker (JS built-ins + SW globals + keywords) */
const SAFE_IDENTS = new Set(('const let var function return if else for while do switch case break continue ' +
    'throw try catch finally new delete typeof instanceof void in of this class ' +
    'extends super async await yield true false null undefined NaN Infinity ' +
    'Object Array String Number Boolean Symbol BigInt Map Set WeakMap WeakSet ' +
    'Promise Error TypeError RangeError JSON Math Date RegExp parseInt parseFloat ' +
    'isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI atob btoa ' +
    'self fetch caches Response Request URL Headers TextEncoder TextDecoder Blob ' +
    'FormData AbortController console crypto setTimeout clearTimeout setInterval ' +
    'clearInterval globalThis structuredClone import export default from as').split(' '));
/**
 * Extract executable code from a function body, stripping string/comment contents.
 * Template literal static parts are removed; ${expr} expressions are preserved.
 */
function extractCode(body) {
    let result = '';
    let i = 0;
    while (i < body.length) {
        const ch = body[i];
        if (ch === "'" || ch === '"') {
            const quote = ch;
            i++;
            while (i < body.length && body[i] !== quote) {
                if (body[i] === '\\')
                    i++;
                i++;
            }
            i++;
        }
        else if (ch === '`') {
            i++;
            while (i < body.length && body[i] !== '`') {
                if (body[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (body[i] === '$' && i + 1 < body.length && body[i + 1] === '{') {
                    i += 2;
                    let depth = 1;
                    while (i < body.length && depth > 0) {
                        if (body[i] === '{')
                            depth++;
                        else if (body[i] === '}') {
                            depth--;
                            if (depth === 0) {
                                i++;
                                break;
                            }
                        }
                        result += body[i];
                        i++;
                    }
                    result += ' ';
                }
                else {
                    i++;
                }
            }
            i++;
        }
        else if (ch === '/' && i + 1 < body.length && body[i + 1] === '/') {
            while (i < body.length && body[i] !== '\n')
                i++;
        }
        else if (ch === '/' && i + 1 < body.length && body[i + 1] === '*') {
            i += 2;
            while (i < body.length - 1 && !(body[i] === '*' && body[i + 1] === '/'))
                i++;
            i += 2;
        }
        else {
            result += ch;
            i++;
        }
    }
    return result;
}
function extractParamNames(fnStr) {
    const match = fnStr.match(/^(?:async\s+)?(?:function\s*\w*\s*)?\(([^)]*)\)|^(\w+)\s*=>/);
    const paramStr = match?.[1] ?? match?.[2] ?? '';
    return new Set(paramStr.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) ?? []);
}
function extractBody(fnStr) {
    const arrowIdx = fnStr.indexOf('=>');
    if (arrowIdx !== -1) {
        const body = fnStr.slice(arrowIdx + 2).trim();
        if (body.startsWith('{') && body.endsWith('}'))
            return body.slice(1, -1);
        return body;
    }
    const braceIdx = fnStr.indexOf('{');
    if (braceIdx !== -1)
        return fnStr.slice(braceIdx + 1, fnStr.lastIndexOf('}'));
    return '';
}
/**
 * Validate that a route handler is self-contained (no closure references).
 * Handlers are serialized via toString() and reconstructed in a Service Worker
 * where closure variables are not available.
 */
export function validateHandler(pattern, handler) {
    const str = handler.toString();
    if (str.includes('[native code]')) {
        throw new Error(`phantom-page: route "${pattern}" handler is not serializable (native/bound function)`);
    }
    const params = extractParamNames(str);
    const body = extractBody(str);
    const code = extractCode(body);
    // Extract locally declared identifiers (const/let/var + function declarations)
    const locals = new Set([
        ...[
            ...code.matchAll(/(?:const|let|var)\s+(?:\{([^}]*)\}|([a-zA-Z_$]\w*))/g),
        ].flatMap((m) => (m[1] ?? m[2] ?? '').match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) ?? []),
        ...[...code.matchAll(/function\s+([a-zA-Z_$]\w*)/g)].map((m) => m[1]),
    ]);
    // Remove property access chains (.identifier) and object literal keys (key:)
    const cleaned = code
        .replace(/\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*/g, '')
        .replace(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/g, ':');
    const allIds = cleaned.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) ?? [];
    const freeVars = [];
    for (const id of allIds) {
        if (!params.has(id) &&
            !locals.has(id) &&
            !SAFE_IDENTS.has(id) &&
            !freeVars.includes(id)) {
            freeVars.push(id);
        }
    }
    if (freeVars.length > 0) {
        throw new Error(`phantom-page: route "${pattern}" handler references external variables: ${freeVars.join(', ')}. ` +
            'Handlers run in a Service Worker via toString() serialization — closures are not available. ' +
            'Make the handler self-contained.');
    }
}
function compileRoutes(routes) {
    return Object.entries(routes).map(([pattern, handler]) => {
        validateHandler(pattern, handler);
        const { regex, keys } = compilePattern(pattern);
        return {
            pattern,
            regex: regex.source,
            keys,
            handler: handler.toString(),
        };
    });
}
export function generateSWScript(routes, fallback) {
    const compiled = compileRoutes(routes);
    return `"use strict";
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const ROUTES = ${JSON.stringify(compiled)};
const FALLBACK = ${fallback ? JSON.stringify(fallback) : 'null'};

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
`;
}
