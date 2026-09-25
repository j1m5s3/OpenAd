// Guards ADR-0016's static-hosting invariants after both builds have run
// (`npm run build`, `npm run build:demo`). Run by CI and callable locally:
//   node web/scripts/check-demo-bundle.mjs
//
// (a) dist-demo contains no baked-in real API/RPC host, except two specific, inert literals —
//     matched only by their EXACT surrounding context, each required to occur EXACTLY ONCE across
//     the whole bundle, so a stray, unrelated occurrence of either host string still fails:
//       1. the viem `foundry` chain definition's own RPC URLs
//          (`node_modules/viem/.../foundry.js`), matched only inside its literal
//          `rpcUrls:{default:{http:["http://127.0.0.1:8545"],webSocket:["ws://127.0.0.1:8545"]}}`
//          object — dead data, since the demo's EIP-1193 simulator (`demo/demoChain.ts`) answers
//          every call in-process and never dials it;
//       2. `@openad/embed`'s own `DEFAULT_API` fallback (`embed/src/open-ad.ts`,
//          `const DEFAULT_API = "http://localhost:8000"`), used only when an `<open-ad>` element
//          has no `api` attribute — never true in demo mode, where `EmbedDemoPage.tsx` always
//          sets `api` explicitly (`demo/assetUrl.ts`, ADR-0016 hosting amendment). Restricted to
//          the embed's own compiled chunk (`open-ad-*.js`), so the same literal appearing
//          anywhere else still fails. `web/src/lib/api.ts`'s own equivalent fallback is avoided
//          outright, not whitelisted: `build-demo.mjs` sets `VITE_API_URL` so that literal never
//          bakes into `dist-demo` in the first place — sanity-checked by hand: temporarily
//          commenting out that env var in `build-demo.mjs` and rebuilding makes this check fail
//          with a denied "localhost:8000" host in an `index-*.js`/`App-*.js` chunk, not the
//          `open-ad-*.js` one; reverted before committing.
// (b) dist-demo/index.html's <script src>/<link href> are all relative (no leading "/" or a
//     scheme), so the bundle runs unpacked under any sub-path with no server rewrite.
// (c) dist (the normal build) carries no demo code or assets: none of the demo markers, and no
//     demo/creatives/* asset paths.
//
// Exits non-zero with a report of every failure found.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const distDemo = `${webDir}/dist-demo`;
const dist = `${webDir}/dist`;

/** Real hosts a demo build must never dial. */
const DENIED_HOSTS = ['localhost:8000', '127.0.0.1:8545'];

/** viem `foundry`'s literal `rpcUrls` object (see header): the ONLY context where
 * `127.0.0.1:8545` may appear, anywhere in `dist-demo`. */
const FOUNDRY_RPC_URLS =
  /rpcUrls:\{default:\{http:\["http:\/\/127\.0\.0\.1:8545"\],webSocket:\["ws:\/\/127\.0\.0\.1:8545"\]\}\}/g;

/** `@openad/embed`'s `DEFAULT_API` fallback literal (see header): the ONLY context where
 * `localhost:8000` may appear, and only inside the embed's own compiled chunk. */
const EMBED_DEFAULT_API = /["']http:\/\/localhost:8000["']/g;
const EMBED_CHUNK_NAME = /^open-ad-.*\.(js|mjs)$/;

const DEMO_MARKERS = ['openad-demo', 'DEMO_ABIS', 'PersonaSwitcher', 'demoServe', 'tour/steps'];

const failures = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Matches of `pattern` across every file in `files`, each as `[file, start, end]`, plus a
 * single failure appended to `failures` if the total count across all of them is not exactly 1
 * (covers viem/embed changing shape upstream, or the literal accidentally duplicating). */
function anchorRanges(files, pattern, label) {
  const found = [];
  for (const file of files) {
    for (const match of file.content.matchAll(pattern)) {
      found.push([file.path, match.index, match.index + match[0].length]);
    }
  }
  if (found.length !== 1) {
    failures.push(`expected exactly one ${label} literal in dist-demo, found ${found.length}`);
  }
  return found;
}

function checkDeniedHosts(files) {
  const embedFiles = files.filter((f) => EMBED_CHUNK_NAME.test(basename(f.path)));
  const foundryRanges = anchorRanges(files, FOUNDRY_RPC_URLS, 'viem foundry rpcUrls');
  const embedRanges = anchorRanges(embedFiles, EMBED_DEFAULT_API, '@openad/embed DEFAULT_API');
  const rangesByFile = new Map();
  for (const [path, start, end] of [...foundryRanges, ...embedRanges]) {
    if (!rangesByFile.has(path)) rangesByFile.set(path, []);
    rangesByFile.get(path).push([start, end]);
  }

  for (const { path, content } of files) {
    const ranges = rangesByFile.get(path) ?? [];
    for (const host of DENIED_HOSTS) {
      let from = 0;
      for (;;) {
        const idx = content.indexOf(host, from);
        if (idx === -1) break;
        from = idx + host.length;
        const whitelisted = ranges.some(([start, end]) => idx >= start && idx < end);
        if (!whitelisted) {
          const context = content.slice(Math.max(0, idx - 30), idx + host.length + 10);
          failures.push(`${path}: denied host "${host}" — ...${context}...`);
        }
      }
    }
  }
}

function checkDemoBundle() {
  if (!existsSync(distDemo)) {
    failures.push(`missing ${distDemo} — run "npm run build:demo" first`);
    return;
  }
  const files = walk(distDemo)
    .filter((path) => /\.(js|mjs|html|css)$/.test(path))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
  checkDeniedHosts(files);

  const indexPath = `${distDemo}/index.html`;
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    const attrPattern = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g;
    for (const match of html.matchAll(attrPattern)) {
      const url = match[1];
      if (url.startsWith('data:')) continue;
      if (url.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
        failures.push(`dist-demo/index.html: non-relative asset URL "${url}"`);
      }
    }
  } else {
    failures.push(`missing ${indexPath}`);
  }
}

function checkNormalDist() {
  if (!existsSync(dist)) {
    failures.push(`missing ${dist} — run "npm run build" first`);
    return;
  }
  for (const file of walk(dist)) {
    if (file.includes('/demo/creatives/')) {
      failures.push(`${file}: demo creative asset shipped in the normal dist`);
      continue;
    }
    if (!/\.(js|mjs|html|css)$/.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const marker of DEMO_MARKERS) {
      if (content.includes(marker)) {
        failures.push(`${file}: demo marker "${marker}" leaked into the normal dist`);
      }
    }
  }
}

checkDemoBundle();
checkNormalDist();

if (failures.length > 0) {
  console.error(`check-demo-bundle: ${failures.length} problem(s) found\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check-demo-bundle: ok');
