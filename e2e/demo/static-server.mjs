// Minimal static file server for the demo Playwright suite (ADR-0016 hosting amendment).
// Serves `web/dist-demo` under `/openad-demo/`, with NO SPA fallback — a real static host (e.g.
// a claude.ai Artifact) would 404 a deep link too, which is exactly what proves the hash router
// + relative base make `dist-demo` work with no server rewrite at all.
//
// Usage: node e2e/demo/static-server.mjs <port> <root> <mountPath>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [, , portArg, rootArg, mountArg] = process.argv;
const port = Number(portArg ?? 4173);
const root = rootArg ?? 'dist-demo';
const mount = (mountArg ?? '/openad-demo/').replace(/\/?$/, '/');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function contentType(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (!url.pathname.startsWith(mount)) {
    res.writeHead(404).end('not found');
    return;
  }
  const relative = url.pathname.slice(mount.length) || 'index.html';
  const filePath = normalize(join(root, relative));
  // No SPA fallback, on purpose (see file header): an unknown path is a real 404.
  if (
    !filePath.startsWith(normalize(root)) ||
    !existsSync(filePath) ||
    statSync(filePath).isDirectory()
  ) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`static-server: serving ${root} at http://localhost:${port}${mount}`);
});
