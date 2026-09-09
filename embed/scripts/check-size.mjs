// Enforces the embed size budget (docs/ARCHITECTURE.md §6): each bundle ≤ 5 KB gzipped.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 5 * 1024;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const bundles = ['open-ad.js', 'open-ad.iife.js'];

let failed = false;
for (const file of bundles) {
  const path = `${dist}${file}`;
  const raw = statSync(path).size;
  const gz = gzipSync(readFileSync(path), { level: 9 }).length;
  const ok = gz <= BUDGET_BYTES;
  failed ||= !ok;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${file.padEnd(16)} ${String(raw).padStart(6)} B raw  ${String(gz).padStart(5)} B gzip  (budget ${BUDGET_BYTES})`,
  );
}
if (failed) {
  console.error('embed exceeds the 5 KB gzipped budget; trim it or raise the budget via an ADR.');
  process.exit(1);
}
