import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpClient } from '../src/services/http.js';
import { createHealthServer } from '../src/health.js';

async function serve(server: ReturnType<typeof createServer>) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  return `http://127.0.0.1:${address.port}`;
}

test('HTTP deadline covers stalled response bodies, not only headers', async (t) => {
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.write('partial');
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = await serve(server);
  const start = Date.now();
  await assert.rejects(new HttpClient('test', 60).request('mock', url), /mock request failed/);
  assert.ok(Date.now() - start < 2000);
});

test('HTTP client bounds bytes, rejects redirects and does not expose error response bodies', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/large' });
      res.end();
    } else if (req.url === '/error') {
      res.writeHead(500);
      res.end('secret-token');
    } else res.end('too large');
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = await serve(server),
    http = new HttpClient('test', 1000, 4);
  await assert.rejects(http.request('test', url + '/large'), /test request failed/);
  await assert.rejects(http.request('test', url + '/redirect'), /test request failed/);
  await assert.rejects(
    new HttpClient('test').json('test', url + '/error'),
    (error) => error instanceof Error && !error.message.includes('secret-token'),
  );
});

test('outgoing JSON uses POST and shutdown cancels an in-flight read', async (t) => {
  let received = '';
  let acknowledge!: () => void;
  const accepted = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const server = createServer(async (req, res) => {
    for await (const part of req) received += part;
    assert.equal(req.method, 'POST');
    res.write('started');
    acknowledge();
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = await serve(server),
    client = new HttpClient('test');
  const pending = client.request('test', url, { token: 'fake' });
  await accepted;
  client.close();
  await assert.rejects(pending);
  assert.equal(JSON.parse(received).token, 'fake');
});

test('health endpoints track readiness, support HEAD, reject unknown paths and do not cache', async (t) => {
  let ready = false;
  const server = createHealthServer(() => ready);
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = await serve(server);
  assert.equal((await fetch(url + '/health')).status, 200);
  const pending = await fetch(url + '/ready');
  assert.equal(pending.status, 503);
  assert.equal(pending.headers.get('cache-control'), 'no-store');
  ready = true;
  assert.equal((await fetch(url + '/ready')).status, 200);
  assert.equal(await (await fetch(url + '/ready', { method: 'HEAD' })).text(), '');
  assert.equal((await fetch(url + '/')).status, 404);
  assert.equal((await fetch(url + '/ready', { method: 'POST' })).status, 405);
});
