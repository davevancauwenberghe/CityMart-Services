import { randomUUID } from 'node:crypto';
import { UserError, ServiceError, RateLimit } from '../core.js';
import type { HttpClient } from './http.js';

/** Context belongs to Hall, surviving bot restarts without a second transcript. */
export class Hallai {
  private pending = new Set<string>();
  private limit = new RateLimit(5, 60_000);
  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
    private readonly apiKey = '',
  ) {}
  private identity(key: string) {
    if (!this.url) throw new UserError('hallAI has not been enabled by the server owner yet.');
    if (!this.apiKey)
      throw new UserError(
        'hallAI is not configured for private conversation memory yet. Please ask the server owner to finish its setup.',
      );
    const match = /^(\d{15,22}):(\d{15,22}):(\d{15,22}):(private|public)$/.exec(key);
    if (!match)
      throw new UserError(
        'This conversation could not be identified. Please try again in a server channel.',
      );
    return {
      source: 'discord',
      guild_id: match[1]!,
      channel_id: match[2]!,
      user_id: match[3]!,
      visibility: match[4]!,
    };
  }
  private async send(path: string, body: unknown) {
    const response = await this.http.request('hallAI', new URL(path, this.url).href, body, 80_000, {
      Authorization: `Bearer ${this.apiKey}`,
    });
    if (response.status === 429)
      throw new UserError(
        'You have reached Hall’s message limit. Please wait before trying again.',
      );
    if (response.status === 409)
      throw new UserError('Hall is still finishing your previous request. Please wait a moment.');
    if (response.status !== 200) throw new ServiceError('hallAI', response.status);
    let data: unknown;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw new ServiceError('hallAI');
    }
    if (!data || typeof data !== 'object') throw new ServiceError('hallAI');
    return data as Record<string, unknown>;
  }
  async forget(key: string) {
    const identity = this.identity(key);
    if (this.pending.has(key))
      throw new UserError(
        'Your previous question is still being answered. Please wait for it to finish.',
      );
    if (this.pending.size >= 100) throw new UserError('hallAI is busy. Please try again shortly.');
    this.limit.take(key);
    this.pending.add(key);
    try {
      const data = await this.send('/api/reset', identity);
      if (data.ok !== true) throw new ServiceError('hallAI');
    } finally {
      this.pending.delete(key);
    }
  }
  async ask(key: string, prompt: string, reset = false) {
    const identity = this.identity(key);
    if (!prompt.trim()) throw new UserError('Enter a question for hallAI.');
    if (prompt.length > 1000) throw new UserError('Keep your question to 1,000 characters.');
    if (this.pending.has(key))
      throw new UserError(
        'Your previous question is still being answered. Please wait for it to finish.',
      );
    if (this.pending.size >= 100) throw new UserError('hallAI is busy. Please try again shortly.');
    this.limit.take(key);
    this.pending.add(key);
    try {
      if (reset) {
        const cleared = await this.send('/api/reset', identity);
        if (cleared.ok !== true) throw new ServiceError('hallAI');
      }
      const data = await this.send('/api/chat', { ...identity, prompt, request_id: randomUUID() });
      if (typeof data.reply !== 'string' || !data.reply.trim() || data.memory !== 'session')
        throw new ServiceError('hallAI');
      return data.reply.length > 16_000
        ? data.reply.slice(0, 15_900) + '\n\n*Response shortened. Ask a follow-up for more detail.*'
        : data.reply;
    } finally {
      this.pending.delete(key);
    }
  }
}
