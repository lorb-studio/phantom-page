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
export declare function compilePattern(pattern: string): {
    regex: RegExp;
    keys: string[];
};
export declare function matchRoute(pathname: string, pattern: string): MatchResult | null;
