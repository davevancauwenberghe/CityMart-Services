const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createHealthServer, parsePort } = require('../utils/health');

async function startServer(t, isReady) {
  const server = createHealthServer(isReady);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('health stays live while readiness follows the Discord connection', async t => {
  let ready = false;
  const base = await startServer(t, () => ready);
  const live = await fetch(`${base}/health`);
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await live.json(), { status: 'ok', discord: 'connecting' });

  const waiting = await fetch(`${base}/ready`);
  assert.equal(waiting.status, 503);
  assert.deepEqual(await waiting.json(), { status: 'not_ready', discord: 'connecting' });

  ready = true;
  const connected = await fetch(`${base}/ready?probe=coolify`);
  assert.equal(connected.status, 200);
  assert.deepEqual(await connected.json(), { status: 'ok', discord: 'connected' });

  ready = false;
  const disconnected = await fetch(`${base}/ready`);
  assert.equal(disconnected.status, 503);
  await disconnected.text();
});

test('HEAD probes report readiness without a response body', async t => {
  const base = await startServer(t, () => true);
  const response = await fetch(`${base}/ready`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(await response.text(), '');
});

test('removed website pages and assets return JSON 404 responses', async t => {
  const base = await startServer(t, () => true);
  for (const pathname of ['/', '/privacy.html', '/tos.html', '/style.css', '/main.js']) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 404, pathname);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
});

test('health endpoints reject methods other than GET and HEAD', async t => {
  const base = await startServer(t, () => true);
  const response = await fetch(`${base}/ready`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.deepEqual(await response.json(), { error: 'Method not allowed' });
});

test('port configuration defaults to 8080 and rejects invalid listener values', () => {
  assert.equal(parsePort(), 8080);
  assert.equal(parsePort('9000'), 9000);
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('65535'), 65535);
  for (const input of ['', '0', '65536', '-1', '8080.5', 'NaN', '/tmp/socket']) {
    assert.throws(() => parsePort(input), /PORT must be an integer/);
  }
});
