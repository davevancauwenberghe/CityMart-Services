import { randomUUID } from 'node:crypto';
import { UserError, ServiceError, RateLimit, safeLog } from '../core.js';
import type { HttpClient } from './http.js';

export interface HallReply {
  reply: string;
  webSearch: boolean;
  truncated: boolean;
  contextFresh: boolean;
  safety?: 'checked' | 'redirected' | 'support';
  requestId?: string;
}
export class HallFailure extends ServiceError {
  constructor(
    status?: number,
    public readonly reference?: string,
  ) {
    super('hallAI', status);
  }
}
const referenceId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;

/** Context belongs to Hall, surviving bot restarts without a second transcript. */
export class Hallai {
  private pending = new Set<string>();
  private limit = new RateLimit(5, 60_000);
  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
    private readonly apiKey = '',
  ) {}
  get configurationWarning(): string | undefined {
    if (!this.url && !this.apiKey) return undefined;
    const missing = !this.url ? 'WORKER_URL' : !this.apiKey ? 'HALLAI_API_KEY' : undefined;
    if (!missing) return undefined;
    return `Hall Discord setup incomplete: ${missing} is missing. Set WORKER_URL to the Hall Worker origin and HALLAI_API_KEY to the Worker's DISCORD_API_KEY in Coolify's production runtime environment, then redeploy the bot.`;
  }
  private identity(key: string) {
    if (!this.url || !this.apiKey)
      throw new UserError(
        'Hall’s Discord connection is not configured yet. Please ask the server owner to finish setup.',
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
    let data: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(response.text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>;
    } catch {
      /* Upstream bodies are never surfaced as error messages. */
    }
    const reference = referenceId(data?.request_id);
    const suffix = reference ? `\nReference: ${reference}` : '';
    if (response.status === 401 || response.status === 403) {
      safeLog(
        'hallai_access_denied_check_worker_url_and_matching_integration_secrets',
        new ServiceError('hallAI', response.status),
      );
      throw new UserError(
        'Hall’s Discord connection was refused. Please ask the server owner to check its setup.' +
          suffix,
      );
    }
    if (response.status === 429)
      throw new UserError(
        'You have reached Hall’s message limit. Please wait before trying again.' + suffix,
      );
    if (response.status === 409)
      throw new UserError(
        'Hall is still finishing your previous request. Please wait a moment.' + suffix,
      );
    if (response.status !== 200) throw new HallFailure(response.status, reference);
    if (!data) throw new HallFailure(response.status, reference);
    return data;
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
  async ask(key: string, prompt: string, reset = false): Promise<HallReply> {
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
      if (
        typeof data.reply !== 'string' ||
        !data.reply.trim() ||
        data.reply.length > 16_000 ||
        data.memory !== 'session'
      )
        throw new ServiceError('hallAI');
      return {
        reply: data.reply,
        webSearch: data.web_search === true,
        truncated: data.truncated === true,
        contextFresh: data.context_fresh === true,
        safety: ['checked', 'redirected', 'support'].includes(String(data.safety))
          ? (data.safety as HallReply['safety'])
          : undefined,
        requestId: referenceId(data.request_id),
      };
    } finally {
      this.pending.delete(key);
    }
  }
}
