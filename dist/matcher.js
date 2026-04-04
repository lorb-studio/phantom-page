/**
 * Compile a route pattern into a RegExp + param names.
 * Supports:
 *   /blog/:slug   → named param
 *   /files/*       → wildcard (captured as `wild`)
 *   /exact         → literal match
 */
export function compilePattern(pattern) {
    const keys = [];
    const segments = pattern.split('/').filter(Boolean);
    const parts = segments.map((seg) => {
        if (seg.startsWith(':')) {
            keys.push(seg.slice(1));
            return '([^/]+)';
        }
        if (seg === '*') {
            keys.push('wild');
            return '(.+)';
        }
        return escapeRegExp(seg);
    });
    const regex = new RegExp('^/' + parts.join('/') + '/?$');
    return { regex, keys };
}
export function matchRoute(pathname, pattern) {
    const { regex, keys } = compilePattern(pattern);
    const m = pathname.match(regex);
    if (!m)
        return null;
    const params = {};
    for (let i = 0; i < keys.length; i++) {
        params[keys[i]] = decodeURIComponent(m[i + 1]);
    }
    return { params };
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
