import { UserError, ServiceError, RateLimit } from '../core.js';
import type { HttpClient } from './http.js';
interface Turn {
  role: 'user' | 'assistant';
  content: string;
}
export class Hallai {
  private conversations = new Map<string, { turns: Turn[]; expires: number }>();
  private pending = new Set<string>();
  private limit = new RateLimit(5, 60_000);
  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
    private readonly now = Date.now,
  ) {}
  async ask(key: string, prompt: string, reset = false) {
    if (!this.url) throw new UserError('hallAI has not been enabled by the server owner yet.');
    if (!prompt.trim()) throw new UserError('Enter a question for hallAI.');
    if (prompt.length > 1000) throw new UserError('Keep your question to 1,000 characters.');
    if (this.pending.has(key))
      throw new UserError(
        'Your previous question is still being answered. Please wait for it to finish.',
      );
    if (this.pending.size >= 100) throw new UserError('hallAI is busy. Please try again shortly.');
    this.limit.take(key);
    for (const [k, v] of this.conversations)
      if (v.expires <= this.now()) this.conversations.delete(k);
    if (!this.conversations.has(key) && this.conversations.size >= 300)
      this.conversations.delete(this.conversations.keys().next().value!);
    this.pending.add(key);
    const history = reset ? [] : this.conversations.get(key)?.turns || [];
    try {
      const result = await this.http.request(
        'hallAI',
        this.url,
        {
          prompt,
          identifier: key,
          messages: [
            {
              role: 'system',
              content:
                'You are hallAI, a helpful retro terminal assistant built by Dave Van Cauwenberghe. Be concise, thoughtful and lightly witty. Format answers clearly using Discord markdown. Do not claim to have performed actions or verified facts you cannot access.',
            },
            ...history,
            { role: 'user', content: prompt },
          ],
        },
        30_000,
      );
      if (result.status !== 200 || !result.text.trim())
        throw new ServiceError('hallAI', result.status);
      const answer =
        result.text.length > 16_000
          ? result.text.slice(0, 15_900) +
            '\n\n*Response shortened. Ask a follow-up for more detail.*'
          : result.text;
      if (!this.conversations.has(key) && this.conversations.size >= 300)
        this.conversations.delete(this.conversations.keys().next().value!);
      this.conversations.set(key, {
        turns: [
          ...history,
          { role: 'user', content: prompt },
          { role: 'assistant', content: answer.slice(0, 4000) },
        ].slice(-8) as Turn[],
        expires: this.now() + 30 * 60_000,
      });
      return answer;
    } finally {
      this.pending.delete(key);
    }
  }
}
