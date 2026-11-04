import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createStaticServer, resolvePath, ROOT } from '../scripts/serve.mjs';

function get(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      })
      .on('error', reject);
  });
}

test('serve: loopback static server serves modules with correct MIME types and blocks escapes', async () => {
  const server = createStaticServer(ROOT);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port, address } = server.address();
  try {
    assert.equal(address, '127.0.0.1');
    const app = await get(port, '/app/app.js');
    assert.equal(app.status, 200);
    assert.equal(app.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.ok(app.headers['content-security-policy'].includes("script-src 'self'"));
    const engine = await get(port, '/src/index.js');
    assert.equal(engine.status, 200);
    const html = await get(port, '/app/');
    assert.equal(html.status, 200);
    assert.equal(html.headers['content-type'], 'text/html; charset=utf-8');
    assert.ok(html.body.includes('<!doctype html>') || html.body.includes('<!DOCTYPE html>'));
    const landing = await get(port, '/');
    assert.equal(landing.status, 200);
    const missing = await get(port, '/nope.js');
    assert.equal(missing.status, 404);
    const git = await get(port, '/.git/config');
    assert.equal(git.status, 404);
    const escape = await get(port, '/..%2F..%2Fetc%2Fpasswd');
    assert.equal(escape.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('serve: resolvePath never leaves the root or exposes dotfiles', () => {
  assert.equal(resolvePath(ROOT, '/.git/HEAD'), null);
  assert.equal(resolvePath(ROOT, '/../package.json'), null);
  assert.equal(resolvePath(ROOT, '/%2e%2e/x'), null);
  assert.equal(resolvePath(ROOT, '/a%00b'), null);
  assert.equal(resolvePath(ROOT, '/%E0%A4%A'), null);
  assert.ok(resolvePath(ROOT, '/app/app.js').endsWith('/app/app.js'));
  assert.equal(resolvePath(ROOT, '/'), ROOT);
});
