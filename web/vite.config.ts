import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const webRoot = fileURLToPath(new URL('.', import.meta.url));

/** Ships the versioned embed script (ROADMAP 6.3, `docs/ADR/0017` amendment): copies
 * `embed/dist/open-ad.js` (built by `web`'s own `prebuild`/`build-demo.mjs` step, never by this
 * plugin) to `<outDir>/embed/open-ad.v1.js`, so `lib/embedSnippet.ts`'s default script URL
 * (`new URL('embed/open-ad.v1.js', document.baseURI)`) resolves to a real file in both the
 * normal build (`dist`) and the demo build (`dist-demo`). Runs on `closeBundle`, once per build,
 * after Vite has written `outDir`. The file is versioned (`v1`) so a future breaking embed
 * change ships alongside, not over, older publisher snippets.
 *
 * Strips the trailing `//# sourceMappingURL=open-ad.js.map` comment rather than also copying
 * that `.map` file across: the map's own `sources`/`sourcesContent` point at `embed/src/*`
 * relative to `embed/dist/`, which would be wrong (or simply missing) once copied next to the
 * web app's own output, and a `sourceMappingURL` the browser can't resolve is worse than none —
 * it makes a real 404 request from every page that loads the script. */
function embedScriptCopy(): Plugin {
  let outDir = 'dist';
  return {
    name: 'openad-embed-script-copy',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const src = fileURLToPath(new URL('../embed/dist/open-ad.js', import.meta.url));
      const destDir = resolve(isAbsolute(outDir) ? outDir : resolve(webRoot, outDir), 'embed');
      mkdirSync(destDir, { recursive: true });
      const code = readFileSync(src, 'utf8').replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n');
      writeFileSync(resolve(destDir, 'open-ad.v1.js'), code);
    },
  };
}

/** Demo builds (ADR-0016) make no outside request, fonts included: drop the Google Fonts
 * `preconnect` + stylesheet links from `index.html` so the CSS stack falls back to system fonts,
 * and declare an empty inline favicon so the browser's implicit `/favicon.ico` probe cannot 404
 * on a static host. Normal builds keep `index.html` unchanged. */
function demoIndexHtml(demo: boolean): Plugin {
  return {
    name: 'openad-demo-index-html',
    transformIndexHtml(html) {
      if (!demo) return html;
      return html
        .replace(/[ \t]*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '')
        .replace('</title>', '</title>\n    <link rel="icon" href="data:," />');
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDemo =
    (process.env.VITE_DEMO_MODE ?? loadEnv(mode, repoRoot, 'VITE_').VITE_DEMO_MODE) === '1';
  return {
    plugins: [react(), tailwindcss(), demoIndexHtml(isDemo), embedScriptCopy()],
    envDir: repoRoot,
    // Demo builds ship no demo assets in the normal `dist` (`web/public`): `web/public-demo/demo/**`
    // holds the fixture creative SVGs, and only `build:demo` (VITE_DEMO_MODE=1) serves it as the
    // public dir (ADR-0016 hosting amendment). `web/public` need not exist for the demo build.
    publicDir: isDemo ? 'public-demo' : 'public',
    // The normal build keeps the default absolute base ('/'); `build:demo` passes `VITE_BASE=./`
    // (ADR-0016 hosting amendment) so `dist-demo` works unpacked under any sub-path.
    base: process.env.VITE_BASE ?? '/',
    resolve: {
      alias: {
        // `@openad/embed`'s package "exports" points at its build output (`dist/open-ad.js`),
        // which does not exist in dev or CI unless `embed`'s own build ran first. Resolve straight
        // to its source instead, so `/embed-demo` renders the real `<open-ad>` element with no
        // prebuilt dist required (ROADMAP 6.2 step 10+11).
        '@openad/embed': fileURLToPath(new URL('../embed/src/open-ad.ts', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        '/anvil': {
          target: 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/anvil/, '') || '/',
        },
      },
    },
    build: { sourcemap: true, target: 'es2022' },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
