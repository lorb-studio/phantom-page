export interface MatchResult {
  params: Record<string, string>;
}

/**
 * Compile a route pattern into a RegExp + param names.
 * Supports:
 *   /blog/:slug   → named param
 *   /files/*       → wildcard (captured as `wild`)
 *   /exact         → literal match
 */
export function compilePattern(pattern: string): {
  regex: RegExp;
  keys: string[];
} {
  const keys: string[] = [];
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

export function matchRoute(
  pathname: string,
  pattern: string,
): MatchResult | null {
  const { regex, keys } = compilePattern(pattern);
  const m = pathname.match(regex);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    params[keys[i]] = decodeURIComponent(m[i + 1]);
  }
  return { params };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
