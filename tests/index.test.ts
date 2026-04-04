import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { init, destroy, registerSW, waitUntilReady, isSupported, generateSWScript } from '../src/index.js';

// Mock Service Worker API
function createMockSW(initialState = 'installing') {
  const listeners: Record<string, Function[]> = {};
  const sw = {
    state: initialState,
    addEventListener: vi.fn((event: string, fn: Function) => {
      (listeners[event] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: Function) => {
      listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
    }),
    _activate() {
      sw.state = 'activated';
      for (const fn of listeners['statechange'] || []) fn();
    },
  };
  return sw;
}

function createMockRegistration(unregisterResult = true, autoActivate = true) {
  const sw = createMockSW();
  const reg = {
    unregister: vi.fn().mockResolvedValue(unregisterResult),
    scope: '/',
    installing: sw,
    waiting: null,
    active: null,
  } as unknown as ServiceWorkerRegistration;
  // Auto-activate in microtask so tests don't hang
  if (autoActivate) {
    queueMicrotask(() => sw._activate());
  }
  return { reg, sw };
}

function setupBrowserEnv(autoActivate = true, userAgent?: string) {
  const { reg: mockReg, sw: mockSW } = createMockRegistration(true, autoActivate);
  const revokeURL = vi.fn();
  const swListeners: Record<string, Function[]> = {};

  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      serviceWorker: {
        register: vi.fn().mockResolvedValue(mockReg),
        controller: null as ServiceWorker | null,
        addEventListener: vi.fn((event: string, fn: Function, opts?: object) => {
          (swListeners[event] ??= []).push(fn);
        }),
        removeEventListener: vi.fn(),
      },
      userAgent: userAgent ?? 'Mozilla/5.0 Chrome/120.0.0.0',
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'URL', {
    value: {
      createObjectURL: vi.fn().mockReturnValue('blob:mock'),
      revokeObjectURL: revokeURL,
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'Blob', {
    value: class MockBlob {
      constructor(
        public parts: string[],
        public options: object,
      ) {}
    },
    configurable: true,
  });

  const fireControllerChange = () => {
    (navigator.serviceWorker as any).controller = {} as ServiceWorker;
    for (const fn of swListeners['controllerchange'] || []) fn();
  };

  return { mockReg, mockSW, revokeURL, fireControllerChange };
}

function teardownBrowserEnv() {
  // @ts-expect-error cleanup
  delete globalThis.window;
  // @ts-expect-error cleanup
  delete globalThis.navigator;
}

const dummyConfig = {
  routes: {
    '/test/:id': ({ id }: Record<string, string>) => `<p>${id}</p>`,
  },
};

describe('SSR guard', () => {
  beforeEach(() => {
    teardownBrowserEnv();
  });

  it('init returns noop destroy in non-browser env', () => {
    const cleanup = init(dummyConfig);
    expect(typeof cleanup).toBe('function');
  });

  it('noop destroy resolves to false', async () => {
    const cleanup = init(dummyConfig);
    expect(await cleanup()).toBe(false);
  });

  it('registerSW returns null in non-browser env', async () => {
    const result = await registerSW(dummyConfig);
    expect(result).toBeNull();
  });
});

describe('isSupported', () => {
  afterEach(() => {
    teardownBrowserEnv();
  });

  it('returns false in non-browser env', () => {
    teardownBrowserEnv();
    expect(isSupported()).toBe(false);
  });

  it('returns true for Chrome', () => {
    setupBrowserEnv(true, 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    expect(isSupported()).toBe(true);
  });

  it('returns false for Firefox', () => {
    setupBrowserEnv(true, 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0');
    expect(isSupported()).toBe(false);
  });

  it('returns false for Safari', () => {
    setupBrowserEnv(true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');
    expect(isSupported()).toBe(false);
  });
});

describe('generateSWScript re-export', () => {
  it('is exported from the public API', () => {
    expect(typeof generateSWScript).toBe('function');
  });

  it('generates a valid SW script string', () => {
    const script = generateSWScript(
      { '/hello': () => '<h1>Hello</h1>' },
      undefined,
    );
    expect(script).toContain('self.addEventListener("fetch"');
    expect(script).toContain('ROUTES');
  });
});

describe('init + destroy (browser env)', () => {
  let mockReg: ServiceWorkerRegistration;
  let revokeURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const env = setupBrowserEnv();
    mockReg = env.mockReg;
    revokeURL = env.revokeURL;
  });

  afterEach(() => {
    teardownBrowserEnv();
  });

  it('init registers a SW via blob URL and waits for activation', async () => {
    const cleanup = init(dummyConfig);
    // Wait for internal registration + activation to complete
    await vi.waitFor(() => {
      expect(revokeURL).toHaveBeenCalledWith('blob:mock');
    });
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      'blob:mock',
      { scope: '/' },
    );
    expect(typeof cleanup).toBe('function');
  });

  it('destroy unregisters the SW', async () => {
    const cleanup = init(dummyConfig);
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    const result = await cleanup();
    expect(result).toBe(true);
    expect(mockReg.unregister).toHaveBeenCalled();
  });

  it('destroy returns false when no registration exists', async () => {
    // Call destroy without init
    const result = await destroy();
    expect(result).toBe(false);
  });

  it('second destroy returns false (already unregistered)', async () => {
    const cleanup = init(dummyConfig);
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    await cleanup();
    const result = await cleanup();
    expect(result).toBe(false);
  });

  it('init with fallback passes fallback to SW generator', async () => {
    init({
      routes: { '/x': () => '<p>x</p>' },
      fallback: '/404.html',
    });
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });
  });
});

describe('swUrl option (real file registration)', () => {
  let mockReg: ServiceWorkerRegistration;

  beforeEach(() => {
    const env = setupBrowserEnv();
    mockReg = env.mockReg;
  });

  afterEach(() => {
    teardownBrowserEnv();
  });

  it('registers from swUrl instead of blob URL when provided', async () => {
    const config = {
      routes: { '/test': () => '<p>test</p>' },
      swUrl: '/phantom-sw.js',
    };

    const reg = await registerSW(config);
    expect(reg).not.toBeNull();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      '/phantom-sw.js',
      { scope: '/' },
    );
    // Should NOT create a blob URL
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('init with swUrl works in Firefox-like UA', async () => {
    teardownBrowserEnv();
    setupBrowserEnv(true, 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0');

    const config = {
      routes: { '/test': () => '<p>test</p>' },
      swUrl: '/phantom-sw.js',
    };

    const cleanup = init(config);
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
        '/phantom-sw.js',
        { scope: '/' },
      );
    });

    expect(typeof cleanup).toBe('function');
  });

  it('init with swUrl works in Safari-like UA', async () => {
    teardownBrowserEnv();
    setupBrowserEnv(true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');

    const config = {
      routes: { '/test': () => '<p>test</p>' },
      swUrl: '/phantom-sw.js',
    };

    const cleanup = init(config);
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
        '/phantom-sw.js',
        { scope: '/' },
      );
    });

    expect(typeof cleanup).toBe('function');
  });
});

describe('blob URL rejection on unsupported browsers', () => {
  afterEach(() => {
    teardownBrowserEnv();
  });

  it('registerSW throws helpful error on Firefox without swUrl', async () => {
    setupBrowserEnv(true, 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0');

    await expect(registerSW(dummyConfig)).rejects.toThrow(
      'does not support blob URL',
    );
  });

  it('registerSW throws helpful error on Safari without swUrl', async () => {
    setupBrowserEnv(true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');

    await expect(registerSW(dummyConfig)).rejects.toThrow(
      'does not support blob URL',
    );
  });
});

describe('registerSW (browser env)', () => {
  beforeEach(() => {
    setupBrowserEnv();
  });

  afterEach(() => {
    teardownBrowserEnv();
  });

  it('returns the registration object', async () => {
    const reg = await registerSW(dummyConfig);
    expect(reg).not.toBeNull();
    expect(navigator.serviceWorker.register).toHaveBeenCalled();
  });

  it('revokes blob URL after registration', async () => {
    await registerSW(dummyConfig);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('revokes blob URL even if registration fails', async () => {
    vi.mocked(navigator.serviceWorker.register).mockRejectedValueOnce(
      new Error('fail'),
    );

    await expect(registerSW(dummyConfig)).rejects.toThrow('fail');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('phantom route navigation (e2e)', () => {
  afterEach(() => {
    teardownBrowserEnv();
  });

  it('init + waitUntilReady -> phantom route /idea/42 returns generated HTML', async () => {
    const { mockSW, fireControllerChange } = setupBrowserEnv();

    // Capture the SW script from the Blob constructor
    let capturedScript = '';
    const OrigBlob = globalThis.Blob;
    Object.defineProperty(globalThis, 'Blob', {
      value: class MockBlob {
        parts: string[];
        options: object;
        constructor(parts: string[], options: object) {
          this.parts = parts;
          this.options = options;
          capturedScript = parts[0];
        }
      },
      configurable: true,
    });

    const config = {
      routes: {
        '/idea/:id': ({ id }: Record<string, string>) =>
          `<h1>Idea #${id}</h1>`,
      },
    };

    const cleanup = init(config);

    // Wait for SW registration + activation
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.register).toHaveBeenCalled();
    });

    // Fire controllerchange so waitUntilReady resolves
    fireControllerChange();
    await waitUntilReady();

    // Verify the generated SW script handles /idea/42 correctly
    expect(capturedScript).toContain('self.addEventListener("fetch"');
    expect(capturedScript).toContain('"keys":["id"]');

    // Simulate what the SW does: extract matchRoute and run the handler
    const matchRouteInSW = new Function(
      'pathname',
      `
      const ROUTES = ${capturedScript.match(/const ROUTES = (\[.*?\]);/s)?.[1]};
      for (const route of ROUTES) {
        const regex = new RegExp(route.regex);
        const m = pathname.match(regex);
        if (!m) continue;
        const params = {};
        for (let i = 0; i < route.keys.length; i++) {
          params[route.keys[i]] = decodeURIComponent(m[i + 1]);
        }
        const fn = new Function("return (" + route.handler + ")")();
        return fn(params);
      }
      return null;
      `,
    );

    const html = matchRouteInSW('/idea/42');
    expect(html).toBe('<h1>Idea #42</h1>');

    // Unmatched route returns null (would pass through in real SW)
    expect(matchRouteInSW('/other/path')).toBeNull();

    await cleanup();
  });
});

describe('waitUntilReady', () => {
  afterEach(() => {
    teardownBrowserEnv();
  });

  it('resolves immediately in non-browser env', async () => {
    teardownBrowserEnv();
    await waitUntilReady();
  });

  it('resolves immediately when controller already exists', async () => {
    setupBrowserEnv();
    (navigator.serviceWorker as any).controller = {} as ServiceWorker;
    init(dummyConfig);
    await waitUntilReady();
  });

  it('waits for controllerchange event when no controller yet', async () => {
    const { fireControllerChange } = setupBrowserEnv();
    init(dummyConfig);

    let resolved = false;
    const p = waitUntilReady().then(() => {
      resolved = true;
    });

    // Not yet resolved
    await vi.waitFor(() => {
      expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith(
        'controllerchange',
        expect.any(Function),
        { once: true },
      );
    });
    expect(resolved).toBe(false);

    // Fire controller change
    fireControllerChange();
    await p;
    expect(resolved).toBe(true);
  });
});
