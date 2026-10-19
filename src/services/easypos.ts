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
}
