import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Env files (.env, .env.local) live at the repo root; only VITE_* keys are exposed.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  // Bind IPv4 and IPv6. Default Vite-on-Windows can listen on [::1] only, so
  // http://127.0.0.1:5173 looks like a blank/failed tab.
  server: { host: true, port: 5173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
