// Tiny static file server for the workbench. Binds to 127.0.0.1 only, serves
// this repository with correct MIME types so ES modules load. No other
// network activity. Node-only (node: imports allowed here, not in src/).

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
});

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
});

function send(res, status, body, type = 'text/plain; charset=utf-8', head = false) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': buffer.length });
  res.end(head ? undefined : buffer);
}

/** Resolves a URL pathname to a file inside root, or null when it escapes or is hidden. */
export function resolvePath(root, pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0 || pathname[0] !== '/') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  // Inspect the raw segments BEFORE any normalisation: a request that contains
  // '..' or a dot-segment anywhere is denied outright rather than normalised
  // away, so '/../package.json' and '/%2e%2e/x' never map onto a real file.
  const segments = decoded.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s.startsWith('.'))) return null; // '.', '..', .git, dotfiles
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export function createStaticServer(root = ROOT) {
  return http.createServer(async (req, res) => {
    try {
      const head = req.method === 'HEAD';
      if (req.method !== 'GET' && !head) {
        send(res, 405, 'Method not allowed');
        return;
      }
      // Check the RAW request path, not URL.pathname: the WHATWG parser would
      // silently normalise '/../package.json' to '/package.json'. Any traversal
      // attempt is answered 404 instead.
      const rawPath = String(req.url || '/').split('?')[0].split('#')[0];
      let filePath = resolvePath(root, rawPath);
      if (!filePath) {
        send(res, 404, 'Not found', undefined, head);
        return;
      }
      let info = await stat(filePath).catch(() => null);
      if (info && info.isDirectory()) {
        const isRoot = filePath === root;
        filePath = path.join(filePath, 'index.html');
        info = await stat(filePath).catch(() => null);
        if (isRoot && !info) {
          // The repository root has no landing page of its own: '/' opens the workbench.
          filePath = path.join(root, 'app', 'index.html');
          info = await stat(filePath).catch(() => null);
        }
      }
      if (!info || !info.isFile()) {
        send(res, 404, 'Not found', undefined, head);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext];
      if (!type) {
        send(res, 404, 'Not found', undefined, head);
        return;
      }
      const body = await readFile(filePath);
      send(res, 200, body, type, head);
    } catch {
      send(res, 500, 'Internal error');
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number.parseInt(process.env.PORT || '8787', 10);
  const server = createStaticServer();
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`HospiceAudit workbench (synthetic demo data only): http://127.0.0.1:${address.port}/`);
    console.log('Bound to loopback only. Press Ctrl+C to stop.');
  });
}
