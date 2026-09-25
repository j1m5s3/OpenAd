import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    demoIndexHtml(
      (process.env.VITE_DEMO_MODE ?? loadEnv(mode, repoRoot, 'VITE_').VITE_DEMO_MODE) === '1',
    ),
  ],
  envDir: repoRoot,
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
}));
