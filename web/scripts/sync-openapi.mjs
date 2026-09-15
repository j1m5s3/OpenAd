// Dumps FastAPI OpenAPI JSON and generates TypeScript types (ROADMAP 3.5).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiDir = fileURLToPath(new URL('../../api', import.meta.url));
const outDir = fileURLToPath(new URL('../src/generated/', import.meta.url));

mkdirSync(outDir, { recursive: true });

const dumped = spawnSync('uv', ['run', 'python', '-m', 'openad.export_openapi'], {
  cwd: apiDir,
  encoding: 'utf8',
  env: { ...process.env, OPENAD_ENV: 'test' },
});
if (dumped.status !== 0) {
  console.error(dumped.stdout);
  console.error(dumped.stderr);
  throw new Error('sync-openapi: failed to export OpenAPI from the API package');
}

const jsonPath = `${outDir}openapi.json`;
writeFileSync(jsonPath, dumped.stdout);
const gen = spawnSync(
  'npx',
  ['openapi-typescript', jsonPath, '-o', `${outDir}openapi.ts`],
  { cwd: repoRoot, encoding: 'utf8', shell: true },
);
if (gen.status !== 0) {
  console.error(gen.stdout);
  console.error(gen.stderr);
  throw new Error('sync-openapi: openapi-typescript failed');
}
console.log('sync-openapi: wrote src/generated/openapi.ts');
