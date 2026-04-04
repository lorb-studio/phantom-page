import { describe, it, expect } from 'vitest';
import { matchRoute, compilePattern } from '../src/matcher.js';

describe('compilePattern', () => {
  it('compiles a literal pattern', () => {
    const { regex, keys } = compilePattern('/about');
    expect(keys).toEqual([]);
    expect(regex.test('/about')).toBe(true);
    expect(regex.test('/about/')).toBe(true);
    expect(regex.test('/other')).toBe(false);
  });

  it('compiles a named param pattern', () => {
    const { regex, keys } = compilePattern('/blog/:slug');
    expect(keys).toEqual(['slug']);
    expect(regex.test('/blog/hello')).toBe(true);
    expect(regex.test('/blog/')).toBe(false);
  });

  it('compiles multiple named params', () => {
    const { regex, keys } = compilePattern('/product/:category/:id');
    expect(keys).toEqual(['category', 'id']);
    expect(regex.test('/product/shoes/42')).toBe(true);
    expect(regex.test('/product/shoes')).toBe(false);
  });

  it('compiles a wildcard pattern', () => {
    const { regex, keys } = compilePattern('/files/*');
    expect(keys).toEqual(['wild']);
    expect(regex.test('/files/a/b/c')).toBe(true);
    expect(regex.test('/files/')).toBe(false);
  });
});

describe('matchRoute', () => {
  it('returns null for non-matching path', () => {
    expect(matchRoute('/other', '/about')).toBeNull();
  });

  it('matches a literal route', () => {
    const result = matchRoute('/about', '/about');
    expect(result).toEqual({ params: {} });
  });

  it('matches trailing slash', () => {
    const result = matchRoute('/about/', '/about');
    expect(result).toEqual({ params: {} });
  });

  it('extracts named params', () => {
    const result = matchRoute('/blog/my-post', '/blog/:slug');
    expect(result).toEqual({ params: { slug: 'my-post' } });
  });

  it('extracts multiple named params', () => {
    const result = matchRoute('/product/shoes/42', '/product/:category/:id');
    expect(result).toEqual({ params: { category: 'shoes', id: '42' } });
  });

  it('extracts wildcard', () => {
    const result = matchRoute('/files/a/b/c.txt', '/files/*');
    expect(result).toEqual({ params: { wild: 'a/b/c.txt' } });
  });

  it('decodes URI components', () => {
    const result = matchRoute('/blog/hello%20world', '/blog/:slug');
    expect(result).toEqual({ params: { slug: 'hello world' } });
  });

  it('does not match partial paths', () => {
    expect(matchRoute('/about/extra', '/about')).toBeNull();
  });

  it('escapes regex special chars in literal segments', () => {
    const result = matchRoute('/api.v2/status', '/api.v2/status');
    expect(result).toEqual({ params: {} });
    // Should not match 'apixv2' (dot must be literal)
    expect(matchRoute('/apixv2/status', '/api.v2/status')).toBeNull();
  });
});
