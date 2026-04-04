import { describe, it, expect } from 'vitest';
import { generateSWScript, validateHandler } from '../src/sw-generator.js';

describe('generateSWScript', () => {
  it('generates valid JS with route config embedded', () => {
    const script = generateSWScript({
      '/blog/:slug': ({ slug }) => `<h1>${slug}</h1>`,
    });

    expect(script).toContain('"use strict"');
    expect(script).toContain('ROUTES');
    expect(script).toContain('self.addEventListener("fetch"');
    expect(script).toContain('self.clients.claim()');
  });

  it('embeds compiled regex and keys for each route', () => {
    const script = generateSWScript({
      '/product/:id': ({ id }) => `<p>${id}</p>`,
      '/files/*': ({ wild }) => `<p>${wild}</p>`,
    });

    expect(script).toContain('"keys":["id"]');
    expect(script).toContain('"keys":["wild"]');
  });

  it('embeds serialized handler functions', () => {
    const handler = ({ name }: Record<string, string>) => `<h1>${name}</h1>`;
    const script = generateSWScript({ '/user/:name': handler });

    expect(script).toContain(handler.toString());
  });

  it('includes fallback URL when provided', () => {
    const script = generateSWScript(
      { '/x': () => '<p>x</p>' },
      '/404.html',
    );

    expect(script).toContain('"/404.html"');
    expect(script).toContain('Response.redirect(FALLBACK');
  });

  it('sets FALLBACK to null when not provided', () => {
    const script = generateSWScript({ '/x': () => '<p>x</p>' });

    expect(script).toContain('const FALLBACK = null');
  });

  it('generates syntactically valid JS (no parse errors)', () => {
    const script = generateSWScript({
      '/a/:id': ({ id }) => `<p>${id}</p>`,
      '/b/*': ({ wild }) => `<p>${wild}</p>`,
      '/c': () => '<p>c</p>',
    });

    // Should not throw when parsed as a function body
    expect(() => new Function(script)).not.toThrow();
  });
});

describe('validateHandler', () => {
  it('accepts self-contained handler with destructured params', () => {
    expect(() =>
      validateHandler('/blog/:slug', ({ slug }) => `<h1>${slug}</h1>`),
    ).not.toThrow();
  });

  it('accepts self-contained handler with params object', () => {
    expect(() =>
      validateHandler(
        '/blog/:slug',
        (params) => `<h1>${params.slug}</h1>`,
      ),
    ).not.toThrow();
  });

  it('accepts handler with local variables', () => {
    expect(() =>
      validateHandler('/page/:id', ({ id }) => {
        const html = `<div>${id}</div>`;
        return html;
      }),
    ).not.toThrow();
  });

  it('accepts handler using SW-available globals (Response, JSON)', () => {
    expect(() =>
      validateHandler(
        '/api/:id',
        ({ id }) =>
          new Response(JSON.stringify({ id }), {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    ).not.toThrow();
  });

  it('accepts handler with no params', () => {
    expect(() =>
      validateHandler('/health', () => '<p>ok</p>'),
    ).not.toThrow();
  });

  it('throws for handler referencing closure variable', () => {
    const prefix = '/items';
    expect(() =>
      validateHandler(
        '/item/:id',
        ({ id }) => `<a href="${prefix}/${id}">${id}</a>`,
      ),
    ).toThrow(/external variables.*prefix/);
  });

  it('throws for handler referencing external data object', () => {
    const data: Record<string, number> = { a: 1 };
    expect(() =>
      validateHandler('/x/:key', ({ key }) => String(data[key])),
    ).toThrow(/external variables.*data/);
  });

  it('throws for native/bound functions', () => {
    const bound = (() => '').bind(null);
    expect(() => validateHandler('/x', bound)).toThrow(/not serializable/);
  });

  it('error message includes guidance about self-contained handlers', () => {
    const external = 'hello';
    expect(() =>
      validateHandler('/x', () => external),
    ).toThrow(/self-contained/);
  });
});
