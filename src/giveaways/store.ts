import { open, rename, mkdir, copyFile, unlink, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { isSnowflake } from '../config.js';
import { KeyedLock, UserError, object, safeLog } from '../core.js';

export interface Giveaway {
  messageId: string;
  guildId: string;
  channelId: string;
  createdBy: string;
  prize: string;
  endAt: number;
  entrants: string[];
  ended: boolean;
  winnerId: string | null;
  winnerHistory: string[];
  revision: number;
  messageUpdated: boolean;
  announcementId: string | null;
  dmAttempted: boolean;
  delivered: boolean;
}
interface Document {
  schema: 2;
  giveaways: Record<string, Giveaway>;
}
export async function atomicWrite(file: string, content: string): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
    const dir = await open(dirname(file), 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}
function parseRecord(messageId: string, raw: unknown, legacy: boolean): Giveaway {
  const value = object(raw);
  const ids = [messageId, value.guildId, value.channelId, value.createdBy];
  if (
    !ids.every((id) => typeof id === 'string' && isSnowflake(id)) ||
    typeof value.prize !== 'string' ||
    !value.prize.trim() ||
    value.prize.length > 1000 ||
    typeof value.endAt !== 'number' ||
    !Number.isFinite(value.endAt) ||
    typeof value.ended !== 'boolean' ||
    !Array.isArray(value.entrants) ||
    value.entrants.length > 10_000 ||
    !value.entrants.every((id) => typeof id === 'string' && isSnowflake(id)) ||
    (value.winnerId !== null &&
      (typeof value.winnerId !== 'string' || !isSnowflake(value.winnerId)))
  )
    throw new Error('Invalid giveaway file.');
  const base = {
    messageId,
    guildId: value.guildId as string,
    channelId: value.channelId as string,
    createdBy: value.createdBy as string,
    prize: value.prize,
    endAt: value.endAt,
    entrants: [...new Set(value.entrants)] as string[],
    ended: value.ended,
    winnerId: value.winnerId as string | null,
  };
  if (legacy)
    return {
      ...base,
      winnerHistory: base.winnerId ? [base.winnerId] : [],
      revision: base.ended ? 1 : 0,
      messageUpdated: base.ended,
      announcementId: null,
      dmAttempted: base.ended,
      delivered: base.ended,
    };
  if (
    !Array.isArray(value.winnerHistory) ||
    !value.winnerHistory.every((id) => typeof id === 'string' && isSnowflake(id)) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !['messageUpdated', 'dmAttempted', 'delivered'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    (value.announcementId !== null &&
      (typeof value.announcementId !== 'string' || !isSnowflake(value.announcementId)))
  )
    throw new Error('Invalid giveaway delivery state.');
  return {
    ...base,
    winnerHistory: value.winnerHistory as string[],
    revision: value.revision as number,
    messageUpdated: value.messageUpdated as boolean,
    announcementId: value.announcementId as string | null,
    dmAttempted: value.dmAttempted as boolean,
    delivered: value.delivered as boolean,
  };
}
export class GiveawayStore {
  private data: Document = { schema: 2, giveaways: {} };
  private lock = new KeyedLock();
  constructor(
    readonly file: string,
    private readonly persist = atomicWrite,
  ) {}
  async load() {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    let source: string;
    try {
      const handle = await open(this.file, 'r');
      try {
        const maxBytes = 20 * 1024 * 1024;
        if ((await handle.stat()).size > maxBytes) throw new Error('Giveaway file exceeds 20 MiB.');
        // Use the checked handle, and read at most one byte beyond the limit to detect growth.
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of handle.createReadStream({ autoClose: false, end: maxBytes })) {
          bytes += chunk.length;
          if (bytes > maxBytes) throw new Error('Giveaway file exceeds 20 MiB.');
          chunks.push(chunk);
        }
        source = Buffer.concat(chunks, bytes).toString('utf8');
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (object(error).code === 'ENOENT') {
        await this.persist(this.file, JSON.stringify(this.data));
        return;
      }
      throw error;
    }
    const decoded: unknown = JSON.parse(source);
    if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded))
      throw new Error('Giveaway document must be an object.');
    const parsed = object(decoded);
    const legacy = parsed.schema === undefined;
    if (!legacy && parsed.schema !== 2) throw new Error('Unsupported giveaway file version.');
    const raw = legacy ? parsed : object(parsed.giveaways);
    if (
      !legacy &&
      (!parsed.giveaways || Array.isArray(parsed.giveaways) || typeof parsed.giveaways !== 'object')
    )
      throw new Error('Invalid giveaway document.');
    if (Object.keys(raw).length > 2000) throw new Error('Giveaway file exceeds capacity.');
    const giveaways = Object.fromEntries(
      Object.entries(raw).map(([id, value]) => [id, parseRecord(id, value, legacy)]),
    );
    this.data = { schema: 2, giveaways };
    if (legacy) {
      // An existing backup is retained rather than overwritten on a later start.
      await copyFile(this.file, `${this.file}.legacy.bak`, 1).catch((error) => {
        if (object(error).code !== 'EEXIST') throw error;
      });
      await chmod(`${this.file}.legacy.bak`, 0o600);
      await this.persist(this.file, JSON.stringify(this.data, null, 2));
    }
  }
  list(): Giveaway[] {
    return structuredClone(Object.values(this.data.giveaways));
  }
  get(id: string): Giveaway {
    const value = this.data.giveaways[id];
    if (!value)
      throw new UserError(
        'That giveaway was not found. Use the message ID from a CityMart giveaway.',
      );
    return structuredClone(value);
  }
  private async update<T>(task: (draft: Document) => T): Promise<T> {
    return this.lock.run('file', async () => {
      const draft = structuredClone(this.data);
      const result = task(draft);
      const content = JSON.stringify(draft, null, 2);
      if (Buffer.byteLength(content) > 20 * 1024 * 1024)
        throw new UserError(
          'Giveaway storage has reached its 20 MiB limit. Ask the server owner to archive old records.',
        );
      try {
        await this.persist(this.file, content);
      } catch (error) {
        safeLog('giveaway_save_failed', error);
        throw new UserError(
          'The giveaway could not be saved. No success was recorded. Ask the server owner to check persistent storage before trying again.',
        );
      }
      this.data = draft;
      return structuredClone(result);
    });
  }
  async add(value: Giveaway) {
    return this.update((draft) => {
      if (Object.keys(draft.giveaways).length >= 2000)
        throw new UserError(
          'Giveaway storage is full. Ask the server owner to archive old records.',
        );
      if (draft.giveaways[value.messageId])
        throw new UserError('This giveaway is already registered.');
      draft.giveaways[value.messageId] = structuredClone(value);
    });
  }
  async join(id: string, actor: string, now = Date.now()) {
    return this.change(id, (value) => {
      if (value.ended || value.endAt <= now) throw new UserError('This giveaway has ended.');
      if (value.entrants.includes(actor))
        throw new UserError('You have already entered this giveaway. Good luck!');
      if (value.entrants.length >= 10_000)
        throw new UserError('This giveaway has reached its entry limit.');
      value.entrants.push(actor);
      value.messageUpdated = false;
    });
  }
  async change(id: string, task: (value: Giveaway) => void) {
    return this.update((draft) => {
      const value = draft.giveaways[id];
      if (!value) throw new UserError('That giveaway was not found.');
      task(value);
      return value;
    });
  }
  async draw(id: string, reroll = false, random = randomInt) {
    return this.change(id, (value) => {
      if (value.ended && !reroll) return;
      if (!value.ended && reroll) throw new UserError('End the giveaway before rerolling.');
      if (reroll && !value.delivered)
        throw new UserError(
          'The previous result is still being delivered. Resolve the channel permissions or delivery issue before rerolling.',
        );
      const candidates = value.entrants.filter((actor) => !value.winnerHistory.includes(actor));
      if (reroll && !candidates.length)
        throw new UserError('There are no entrants left who have not already won.');
      value.winnerId = candidates.length ? candidates[random(candidates.length)]! : null;
      if (value.winnerId) value.winnerHistory.push(value.winnerId);
      value.ended = true;
      value.revision++;
      value.delivered = false;
      value.messageUpdated = false;
      value.announcementId = null;
      value.dmAttempted = false;
    });
  }
}
