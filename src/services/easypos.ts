import { ServiceError, UserError, object, numberValue, textValue } from '../core.js';
import type { Config } from '../config.js';
import type { HttpClient } from './http.js';

export class Easypos {
  constructor(
    private readonly http: HttpClient,
    private readonly config: Config,
  ) {}
  private async call(path: string, token: string, body: Record<string, unknown> = {}) {
    if (!token) throw new UserError('This service has not been enabled by the server owner yet.');
    const result = object(
      await this.http.json('easyPOS', `https://papi.easypos.lol/${path}`, { token, ...body }),
    );
    if (result.success !== true || !result.data || typeof result.data !== 'object')
      throw new ServiceError('easyPOS');
    return object(result.data);
  }
  async activity(userId: number) {
    const data = await this.call('activity/data', this.config.easyposToken, { userId });
    const playtime = object(data.playtime),
      messages = object(data.messages),
      formatted = object(playtime.formatted);
    return {
      inGame: typeof data.inGame === 'boolean' ? data.inGame : null,
      playtime: {
        total: textValue(formatted.total),
        month: textValue(formatted.month),
        week: textValue(formatted.week),
        position: numberValue(playtime.position),
      },
      messages: {
        total: numberValue(messages.total),
        month: numberValue(messages.month),
        week: numberValue(messages.week),
        position: numberValue(messages.position),
      },
    };
  }
  async donations(userId: number) {
    const data = await this.call('donations/lookup', this.config.donationsToken, { userId });
    const amount = numberValue(data.amount);
    if (amount === null) throw new ServiceError('easyPOS');
    return amount;
  }
  async leaderboard() {
    const data = await this.call('donations/leaderboard', this.config.donationsToken);
    if (!Array.isArray(data.donations)) throw new ServiceError('easyPOS');
    return data.donations.slice(0, 10).map((value) => {
      const entry = object(value),
        userId = Number(entry.userId),
        amount = numberValue(entry.amount);
      if (!Number.isSafeInteger(userId) || userId <= 0 || amount === null)
        throw new ServiceError('easyPOS');
      return { userId, amount };
    });
  }
  async rank(action: 'promote' | 'demote', userId: number, scaleCode: string | null) {
    if (!this.config.rankingModId)
      throw new UserError('Ranking has not been enabled by the server owner yet.');
    // Mutations are sent once. A timeout can mean the upstream service applied the change.
    let data: Record<string, unknown>;
    try {
      data = await this.call(`ranking/${action}`, this.config.rankingToken, {
        userId,
        modId: Number(this.config.rankingModId),
        ...(action === 'promote' && scaleCode ? { scaleCode } : {}),
      });
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        'The ranking service did not confirm the result. Check the user’s current Roblox rank before trying again; the change may already have been applied.',
      );
    }
    if (typeof data.rank !== 'string' && typeof data.rank !== 'number')
      throw new UserError(
        'The ranking service returned an unexpected result. Check the user’s current rank before trying again.',
      );
    return String(data.rank);
  }
}
