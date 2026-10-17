import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionRowBuilder, ButtonBuilder, type Client } from 'discord.js';
import { GiveawayStore, type Giveaway } from '../src/giveaways/store.js';
import { Giveaways } from '../src/giveaways/service.js';
import { readConfig } from '../src/config.js';
import { giveawayView } from '../src/giveaways/service.js';
const guildId = '100000000000000001',
  channelId = '200000000000000001',
  messageId = '300000000000000001',
  owner = '400000000000000001',
  entrant = '400000000000000002',
  other = '400000000000000003';
const config = readConfig({ DISCORD_TOKEN: 'fake', GUILD_ID: guildId });
export function fixture(): Giveaway {
  return {
    messageId,
    guildId,
    channelId,
    createdBy: owner,
    prize: 'A shopping trip',
    endAt: Date.now() + 60_000,
    entrants: [],
    ended: false,
    winnerId: null,
    winnerHistory: [],
    revision: 0,
    delivered: false,
    messageUpdated: false,
    announcementId: null,
    dmAttempted: false,
  };
}
async function setup(
  t: { after: (fn: () => Promise<void>) => void },
  persist?: (file: string, content: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'citymart-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new GiveawayStore(join(dir, 'giveaways.json'), persist);
  await store.load();
  return store;
}

test('legacy giveaway data migrates with an untouched backup and no replay of historical results', async (t) => {
  const store = await setup(t);
  const legacy = {
    [messageId]: { ...fixture(), ended: true, winnerId: entrant, entrants: [entrant, entrant] },
  };
  await writeFile(store.file, JSON.stringify(legacy));
  await store.load();
  assert.deepEqual(JSON.parse(await readFile(store.file + '.legacy.bak', 'utf8')), legacy);
  const migrated = store.get(messageId);
  assert.deepEqual(migrated.entrants, [entrant]);
  assert.deepEqual(migrated.winnerHistory, [entrant]);
  assert.equal(migrated.delivered, true);
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).schema, 2);
});

test('corrupt state is preserved and rejected instead of silently reset', async (t) => {
  const store = await setup(t);
  for (const invalid of [
    '{corrupt',
    '[]',
    'null',
    '"bad"',
    '{"schema":99}',
    '{"schema":2}',
    '{"not-a-message":{"ended":false}}',
  ]) {
    await writeFile(store.file, invalid);
    await assert.rejects(store.load());
    assert.equal(await readFile(store.file, 'utf8'), invalid);
  }
});

test('concurrent entries are serialized, duplicates rejected and successful results survive restart', async (t) => {
  const store = await setup(t);
  await store.add(fixture());
  const results = await Promise.allSettled([
    store.join(messageId, entrant),
    store.join(messageId, entrant),
    store.join(messageId, other),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  const restarted = new GiveawayStore(store.file);
  await restarted.load();
  assert.deepEqual(restarted.get(messageId).entrants.sort(), [entrant, other]);
  const copy = restarted.get(messageId);
  copy.entrants.length = 0;
  assert.equal(restarted.get(messageId).entrants.length, 2);
});

test('failed persistence never publishes a successful in-memory entry', async (t) => {
  let fail = false;
  const store = await setup(t, async () => {
    if (fail) throw new Error('Disk full');
  });
  await store.add(fixture());
  fail = true;
  await assert.rejects(store.join(messageId, entrant), /could not be saved/);
  assert.deepEqual(store.get(messageId).entrants, []);
});

test('concurrent draws choose once and rerolls exclude previous winners', async (t) => {
  const store = await setup(t),
    value = fixture();
  value.entrants = [entrant, other];
  await store.add(value);
  let choices = 0;
  const choose = (_max: number) => {
    choices++;
    return 0;
  };
  await Promise.all([store.draw(messageId, false, choose), store.draw(messageId, false, choose)]);
  assert.equal(choices, 1);
  assert.equal(store.get(messageId).winnerId, entrant);
  await assert.rejects(store.draw(messageId, true, choose), /still being delivered/);
  await store.change(messageId, (draft) => {
    draft.delivered = true;
  });
  assert.equal((await store.draw(messageId, true, choose)).winnerId, other);
  await store.change(messageId, (draft) => {
    draft.delivered = true;
  });
  await assert.rejects(store.draw(messageId, true, choose), /no entrants left/);
});

test('delivery failure and restart retry the saved winner instead of drawing again', async (t) => {
  const store = await setup(t),
    value = fixture();
  value.entrants = [entrant, other];
  await store.add(value);
  let fail = true,
    announcements = 0,
    directMessages = 0;
  const channel = {
    guildId,
    isTextBased: () => true,
    isDMBased: () => false,
    messages: {
      edit: async () => {
        if (fail) throw new Error('Network failure');
      },
    },
    send: async () => {
      announcements++;
      return { id: '500000000000000001' };
    },
  };
  const client = {
    channels: { fetch: async () => channel },
    users: {
      fetch: async () => ({
        send: async () => {
          directMessages++;
        },
      }),
    },
  } as unknown as Client;
  const service = new Giveaways(store, client, config);
  await assert.rejects(service.finish(messageId, guildId));
  const saved = store.get(messageId).winnerId;
  assert.ok(saved);
  assert.equal(store.get(messageId).revision, 1);
  fail = false;
  const restarted = new GiveawayStore(store.file);
  await restarted.load();
  const resumed = new Giveaways(restarted, client, config);
  await Promise.all([resumed.finish(messageId, guildId), resumed.finish(messageId, guildId)]);
  assert.equal(restarted.get(messageId).winnerId, saved);
  assert.equal(restarted.get(messageId).delivered, true);
  assert.equal(announcements, 1);
  assert.equal(directMessages, 1);
});

test('giveaway entry fails closed when minimum role is missing and checks stored scope', async (t) => {
  const store = await setup(t);
  await store.add(fixture());
  const member = { user: { bot: false } };
  const client = {
    guilds: {
      fetch: async () => ({
        members: { fetch: async () => member },
        roles: { fetch: async () => null },
      }),
    },
  } as unknown as Client;
  const service = new Giveaways(store, client, { ...config, minRoleId: other });
  await assert.rejects(service.join(messageId, guildId, channelId, entrant), /role was removed/);
  await assert.rejects(
    service.join(messageId, guildId, '900000000000000001', entrant),
    /does not match/,
  );
  assert.throws(() => service.scoped(messageId, '900000000000000001'), /different server/);
  assert.deepEqual(store.get(messageId).entrants, []);
});

test('giveaway buttons remain compatible with deployed messages and ended entries remain browsable', () => {
  const active = giveawayView(fixture());
  const buttons = (active.components![0] as ActionRowBuilder<ButtonBuilder>).toJSON();
  assert.equal(buttons.components[0]!.type, 2);
  assert.equal((buttons.components[0] as { custom_id: string }).custom_id, 'giveaway_enter');
  const ended = giveawayView({ ...fixture(), ended: true });
  assert.equal(
    (
      (ended.components![0] as ActionRowBuilder<ButtonBuilder>).toJSON().components[0] as {
        disabled?: boolean;
      }
    ).disabled,
    true,
  );
  assert.equal(
    (
      (ended.components![0] as ActionRowBuilder<ButtonBuilder>).toJSON().components[1] as {
        disabled?: boolean;
      }
    ).disabled,
    false,
  );
});

test('scheduler repairs an active giveaway whose buttons could not be activated', async (t) => {
  const store = await setup(t);
  await store.add(fixture());
  let edits = 0;
  const channel = {
    guildId,
    isTextBased: () => true,
    isDMBased: () => false,
    messages: {
      edit: async () => {
        edits++;
      },
    },
  };
  const client = { channels: { fetch: async () => channel } } as unknown as Client;
  const service = new Giveaways(store, client, config);
  await service.tick();
  assert.equal(edits, 1);
  assert.equal(store.get(messageId).messageUpdated, true);
  await service.tick();
  assert.equal(edits, 1);
});
