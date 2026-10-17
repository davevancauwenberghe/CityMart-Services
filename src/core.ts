export class UserError extends Error {}
export class ServiceError extends Error {
  constructor(
    public readonly service: string,
    public readonly status?: number,
  ) {
    super(`${service} request failed${status ? ` (${status})` : ''}.`);
  }
}

/** Fixed windows with a hard cap; expired entries are removed before live entries. */
export class RateLimit {
  private buckets = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly capacity = 5000,
    private readonly now = Date.now,
  ) {}
  take(key: string, cost = 1): void {
    const now = this.now();
    for (const [k, v] of this.buckets) if (v.reset <= now) this.buckets.delete(k);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.count + cost > this.max)
      throw new UserError(
        `Please try again in ${Math.max(1, Math.ceil((bucket.reset - now) / 1000))} seconds.`,
      );
    if (!bucket && this.buckets.size >= this.capacity)
      throw new UserError('This service is busy. Please try again shortly.');
    if (cost > this.max) throw new UserError('This request exceeds the service limit.');
    this.buckets.set(key, {
      count: (bucket?.count || 0) + cost,
      reset: bucket?.reset || now + this.windowMs,
    });
  }
}

/** Coalesces concurrent loads and caches null results as well as successful lookups. */
export class Cache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  constructor(
    private readonly ttlMs: number,
    private readonly capacity = 500,
    private readonly now = Date.now,
  ) {}
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expires > this.now()) return entry.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= this.capacity)
      throw new UserError('This service is busy. Please try again shortly.');
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        for (const [k, v] of this.entries) if (v.expires <= this.now()) this.entries.delete(k);
        if (this.entries.size >= this.capacity)
          this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(key, { value, expires: this.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}

export class KeyedLock {
  private pending = new Map<string, Promise<unknown>>();
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.pending.set(key, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(key) === next) this.pending.delete(key);
    }
  }
}

export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const textValue = (value: unknown, fallback = 'Not available') =>
  typeof value === 'string' && value.trim() ? value : fallback;
export const numberValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function safeLog(event: string, error?: unknown) {
  // Upstream bodies, URLs, tokens, AI prompts and raw exception messages are never logged.
  const details =
    error instanceof ServiceError
      ? { service: error.service, status: error.status }
      : error
        ? { type: error instanceof Error ? error.name : 'UnknownError' }
        : {};
  const code = object(error).code;
  const safeCode =
    typeof code === 'number' || (typeof code === 'string' && /^E[A-Z_0-9]{1,30}$/.test(code))
      ? code
      : undefined;
  console.error(
    JSON.stringify({ time: new Date().toISOString(), event, ...details, code: safeCode }),
  );
}
