import { createServer } from 'node:http';
export function createHealthServer(isReady: () => boolean) {
  const server = createServer((request, response) => {
    let status = 200;
    let payload: Record<string, string>;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      status = 405;
      payload = { error: 'Method not allowed' };
      response.setHeader('Allow', 'GET, HEAD');
    } else if (!['/health', '/ready'].includes(request.url?.split('?')[0] || '')) {
      status = 404;
      payload = { error: 'Not found' };
    } else {
      const ready = isReady();
      status = request.url?.split('?')[0] === '/ready' && !ready ? 503 : 200;
      payload = {
        status: status === 200 ? 'ok' : 'not_ready',
        discord: ready ? 'connected' : 'connecting',
      };
    }
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  return server;
}
