# phantom-page — Build Chain

## Status

phase: build

## Goal

Build @lorb/phantom-page: on-demand page materialization via Service Worker interception. Ship-ready v0.1.

## Constraints

- Output: products/phantom-page/
- Spec: knowledge/products/phantom-page/spec.md
- Build must pass: `npm run build -w products/phantom-page`
- Tests must pass: `npm test -w products/phantom-page`
- Zero dependencies. ESM only. TypeScript
- Bundle < 2KB gzip
- Follow monorepo patterns from products/otd/ or products/cloak/ for package.json and tsconfig

## Task List

### v0.1 Build

- [x] Scaffold: package.json, tsconfig.json, vitest.config.ts, src/index.ts
- [x] Route pattern matcher: glob patterns (/blog/*, /product/:id) → param extraction
- [x] SW generator: inline Service Worker that intercepts fetch for matched routes
- [x] Generator execution: route handler receives params, returns HTML string or Response
- [x] SW registration via blob URL
- [x] Fallback handling: unmatched routes pass through, generator errors → fallback URL
- [x] init() entry point with routes config and fallback option
- [x] Cleanup function (unregister SW)
- [x] SSR guard
- [x] Unit tests: pattern matching, param extraction, SW generation, fallback, cleanup
- [x] Build verification: tsc --noEmit + bundle size check (30 tests pass, 1.5KB gzip)

### v0.1.1 Fix (NEEDS-REVISION)

Anti-agent flagged: SW blob URL + CSP + handler closure. Real browser e2e failed (init → still 404).

- [x] Fix SW activation wait: after register(), wait for SW to reach 'activated' state before resolving. Currently init() resolves immediately after register() promise — SW may not be intercepting yet
- [x] Fix blob URL revocation timing: URL.revokeObjectURL() in finally block fires before SW loads the script. Move revocation to after SW reaches 'activated' state
- [x] Fix handler serialization: handler.toString() loses closure context. Handlers referencing external variables silently break in SW context. Validate: if handler body references identifiers not in function params, warn or throw at compile time. Document that handlers must be self-contained (no closures)
- [x] Add SW ready helper: export a waitUntilReady() that resolves when SW is activated and controlling. Added clients.claim() to SW activate event for immediate control takeover
- [x] Update e2e test: un-skip the phantom route navigation test. After init() + waitUntilReady(), navigate to /idea/42 and verify generated HTML content appears (not 404)
- [x] Fix demo page: add waitUntilReady() call after init, show "SW active" status before enabling links
- [x] Run full test suite: unit tests + e2e + build + bundle size check (43 tests pass, build OK, 807B gzip)
