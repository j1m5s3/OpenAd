import { defineConfig } from 'vitest/config';

// Library build: dist/open-ad.js (ESM) and dist/open-ad.iife.js (script tag). Both must stay
// under the 5 KB gzipped budget enforced by scripts/check-size.mjs.
export default defineConfig({
  server: { port: 5174, strictPort: true, open: '/demo/' },
  build: {
    target: 'es2020',
    sourcemap: true,
    minify: 'esbuild',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      name: 'OpenAd',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'open-ad.js' : 'open-ad.iife.js'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
