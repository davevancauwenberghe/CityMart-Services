const http = require('node:http');

function parsePort(value = '8080') {
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function createHealthServer(isReady) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(req, res, 405, { error: 'Method not allowed' }, {
        Allow: 'GET, HEAD'
      });
    }

    const pathname = req.url.split('?')[0];
    if (pathname !== '/health' && pathname !== '/ready') {
      return sendJson(req, res, 404, { error: 'Not found' });
    }

    const ready = isReady();
    const status = pathname === '/ready' && !ready ? 503 : 200;
    return sendJson(req, res, status, {
      status: status === 200 ? 'ok' : 'not_ready',
      discord: ready ? 'connected' : 'connecting'
    });
  });

  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

module.exports = { createHealthServer, parsePort };
