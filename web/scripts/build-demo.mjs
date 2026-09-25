// `npm run build:demo` (ADR-0016 hosting amendment). A tiny Node wrapper — no `cross-env`
// dependency — that runs the same sync steps as `npm run build` (deployments + OpenAPI types),
// type-checks, then builds with the demo env vars set in the child process only (never mutating
// this process's own env, so a later `vite.config.ts` read in the same process, e.g. under
// Vitest, is unaffected):
//   VITE_DEMO_MODE=1   demo fixtures + simulated wallet (ADR-0016); also selects `publicDir`.
//   VITE_ROUTER=hash   createHashRouter: no server-side SPA fallback required.
//   VITE_BASE=./       relative asset base: works unpacked from any sub-path.
// Output: `web/dist-demo` (vs. the normal build's `web/dist`).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const embedDir = fileURLToPath(new URL('../../embed', import.meta.url));
const require = createRequire(import.meta.url);

// Resolved bin scripts, run directly with this same `node` (`process.execPath`), instead of
// shelling out to `npx`/`node`/`tsc`/`vite` by name: `npx` needs a shell to resolve on Windows
// (the main dev platform, AGENTS.md), and `shell: true` would reopen the quoting/escaping
// problems a shell brings. `require.resolve` finds each package's own directory the same way
// `npm` itself would, whether hoisted to the repo root or local to `web/node_modules`; the bin
// path is then joined by hand because `vite`'s (unlike `typescript`'s) `package.json` "exports"
// map does not expose `./bin/vite.js` as an importable subpath, only as its `bin` entry.
const tscBin = require.resolve('typescript/bin/tsc');
const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

const demoEnv = {
  ...process.env,
  VITE_DEMO_MODE: '1',
  VITE_ROUTER: 'hash',
  VITE_BASE: './',
  // `lib/api.ts`'s `API_URL` falls back to `http://localhost:8000` when `VITE_API_URL` is unset;
  // that fallback string is never reached at runtime (DEMO_MODE routes every `api.*` call through
  // `setRequestHandler` instead), but Vite still bakes the literal into the bundle. Setting it to
  // an unreachable, obviously-fake host — the same convention `demoApi.ts` already uses as its
  // internal URL-parsing base — keeps the real API's host out of `dist-demo` entirely, for
  // `check-demo-bundle.mjs`'s guard against a leaked host.
  VITE_API_URL: 'http://demo.invalid',
};

function run(label, args, cwd = webDir) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env: demoEnv,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(`build-demo: failed to run ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`build-demo: ${label} exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// `npm run build:demo` invokes this script with `node`, not `npm run`, so `web`'s own
// `prebuild` hook (which builds `embed`) never fires here; build `embed` explicitly, the same
// way its own `npm run build` does, so the versioned embed script (vite.config.ts's
// `embedScriptCopy` plugin) has a `dist/open-ad.js` to copy from.
run('embed tsc --noEmit', [tscBin, '--noEmit', '-p', join(embedDir, 'tsconfig.json')], embedDir);
run('embed vite build', [viteBin, 'build'], embedDir);
run('embed check-size', [join(embedDir, 'scripts', 'check-size.mjs')], embedDir);

run('sync-deployments', [fileURLToPath(new URL('sync-deployments.mjs', import.meta.url))]);
run('sync-openapi', [fileURLToPath(new URL('sync-openapi.mjs', import.meta.url))]);
run('tsc --noEmit', [tscBin, '--noEmit', '-p', 'tsconfig.json']);
run('vite build', [viteBin, 'build', '--outDir', 'dist-demo']);
