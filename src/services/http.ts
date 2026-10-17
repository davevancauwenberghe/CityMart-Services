import { ServiceError } from '../core.js';
export class HttpClient {
  private controllers = new Set<AbortController>();
  constructor(
    private readonly userAgent: string,
    private readonly timeoutMs = 15_000,
    private readonly maxBytes = 1_048_576,
  ) {}
  close() {
    for (const controller of this.controllers) controller.abort();
  }
  async request(
    service: string,
    url: string,
    body?: unknown,
    timeout = this.timeoutMs,
  ): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json, text/plain',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      if (reader) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > this.maxBytes) {
              await reader.cancel();
              throw new ServiceError(service);
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      return { status: response.status, text: Buffer.concat(chunks).toString('utf8') };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(service);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }
  async json(service: string, url: string, body?: unknown): Promise<unknown> {
    const response = await this.request(service, url, body);
    if (response.status < 200 || response.status >= 300)
      throw new ServiceError(service, response.status);
    try {
      return JSON.parse(response.text);
    } catch {
      throw new ServiceError(service);
    }
  }
}
