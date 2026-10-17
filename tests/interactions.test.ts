import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatInputCommandInteraction, Client, EmbedBuilder } from 'discord.js';
import { readConfig } from '../src/config.js';
import { Router } from '../src/router.js';
import { ask, lookup } from '../src/handlers/lookups.js';
import { info, help } from '../src/handlers/info.js';
import { Citycraft } from '../src/handlers/citycraft.js';
import { UserError } from '../src/core.js';
import { splitAnswer, literal } from '../src/ui.js';
import type { Hallai } from '../src/services/hallai.js';
import type { Roblox } from '../src/services/roblox.js';
import type { Easypos } from '../src/services/easypos.js';
import type { Minecraft } from '../src/services/minecraft.js';
const guildId = '100000000000000001',
  actor = '400000000000000001';
const config = readConfig({ DISCORD_TOKEN: 'fake', GUILD_ID: guildId });
interface Payload {
  embeds: EmbedBuilder[];
  content?: string;
  flags?: number;
  components?: unknown[];
}
function mockInteraction(
  commandName: string,
  strings: Record<string, string> = {},
  booleans: Record<string, boolean> = {},
) {
  const replies: Payload[] = [],
    acknowledgements: string[] = [];
  const raw = {
    commandName,
    id: '600000000000000001',
    guildId,
    channelId: '200000000000000001',
    createdTimestamp: Date.now(),
    guild: { id: guildId, ownerId: actor },
    deferred: false,
    replied: false,
    ephemeral: false,
    user: {
      id: actor,
      displayName: 'Test member',
      tag: 'test',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
      toString: () => `<@${actor}>`,
    },
    options: {
      getString: (key: string) => strings[key] ?? null,
      getBoolean: (key: string) => booleans[key] ?? null,
      getSubcommand: () => strings.sub || 'info',
      getUser: () => null,
    },
    isChatInputCommand: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isAutocomplete: () => false,
    deferReply: async (payload?: { flags?: number }) => {
      raw.deferred = true;
      raw.ephemeral = payload?.flags === 64;
      acknowledgements.push('defer');
    },
    editReply: async (payload: Payload) => {
      replies.push(payload);
      return {};
    },
    reply: async (payload: Payload) => {
      raw.replied = true;
      replies.push(payload);
      return {};
    },
    followUp: async (payload: Payload) => {
      replies.push(payload);
      return {};
    },
    showModal: async (payload: { toJSON: () => unknown }) => {
      raw.replied = true;
      return payload.toJSON();
    },
  };
  return {
    interaction: raw as unknown as ChatInputCommandInteraction,
    raw,
    replies,
    acknowledgements,
  };
}
function assertEmbeds(payloads: Payload[]) {
  assert.ok(payloads.length);
  for (const payload of payloads) {
    assert.equal(payload.content, undefined);
    assert.ok(payload.embeds.length > 0 && payload.embeds.length <= 10);
    let total = 0;
    for (const builder of payload.embeds) {
      const data = builder.toJSON();
      assert.ok((data.title?.length || 0) <= 256);
      assert.ok((data.description?.length || 0) <= 4096);
      assert.ok(data.timestamp);
      assert.ok(data.color);
      assert.ok(data.footer?.text.includes('v1.4.0'));
      total +=
        (data.title?.length || 0) +
        (data.description?.length || 0) +
        (data.author?.name.length || 0) +
        (data.footer?.text.length || 0);
      for (const field of data.fields || []) {
        assert.ok(field.value.length <= 1024);
        total += field.name.length + field.value.length;
      }
    }
    assert.ok(total <= 6000, `Embed payload too long: ${total}`);
  }
}
const user = {
  id: 123,
  name: 'Player',
  displayName: 'Display',
  description: 'D'.repeat(8000),
  created: '2020-01-01',
  avatar: null,
};
const roblox = {
  lookup: async () => user,
  profile: async () => user,
  role: async () => ({ name: 'Member', rank: 1 }),
  count: async () => 1000,
} as unknown as Roblox;
const easypos = {
  activity: async () => ({
    inGame: true,
    playtime: { total: 'P'.repeat(3000), month: '1h', week: '1h', position: 1 },
    messages: { total: 5, month: 4, week: 3, position: 2 },
  }),
  donations: async () => 42,
  leaderboard: async () => [{ userId: 123, amount: 42 }],
} as unknown as Easypos;
const minecraft = {
  lookup: async () => ({
    name: 'Player',
    model: 'Slim',
    account: 'Java Edition',
    skinUrl: 'https://textures.minecraft.net/texture/a',
    capeUrl: null,
  }),
} as unknown as Minecraft;
const client = {
  isReady: () => true,
  ws: { ping: 25 },
  user: { id: '900000000000000001' },
} as unknown as Client;

test('/ask includes the complete original question, respects embed budgets and keeps private continuations private', async () => {
  const { interaction, replies } = mockInteraction('ask', { prompt: '*'.repeat(1000) });
  interaction.deferred = true;
  interaction.ephemeral = true;
  const ai = {
    ask: async () => '```ts\n' + 'const x = 1;\n'.repeat(1200) + '```',
  } as unknown as Hallai;
  await ask(interaction, ai);
  assertEmbeds(replies);
  assert.ok(replies[0]!.embeds[0]!.toJSON().description?.includes(literal('*'.repeat(1000), 2050)));
  assert.ok(replies.length > 1);
  for (const followup of replies.slice(1)) assert.equal(followup.flags, 64);
});

test('/ask failure still shows the user’s question in an embed', async () => {
  const { interaction, replies } = mockInteraction('ask', { prompt: 'Where is my cart?' });
  await ask(interaction, {
    ask: async () => {
      throw new UserError('Please wait.');
    },
  } as unknown as Hallai);
  assertEmbeds(replies);
  assert.equal(replies[0]!.embeds[0]!.data.description, 'Where is my cart?');
  assert.equal(replies[0]!.embeds[1]!.data.description, 'Please wait.');
});

test('all information and player command families produce branded embeds within Discord limits', async () => {
  for (const command of [
    'help',
    'about',
    'ping',
    'support',
    'community',
    'experience',
    'application',
    'documentation',
    'lorebook',
    'communitycount',
    'lamp',
  ]) {
    const { interaction, replies } = mockInteraction(command);
    await info(interaction, config, client, roblox);
    assertEmbeds(replies);
  }
  for (const section of ['overview', 'players', 'community', 'tools', 'owner']) {
    const { interaction, replies } = mockInteraction('help');
    await help(interaction, section);
    assertEmbeds(replies);
  }
  for (const command of [
    'memberlookup',
    'activity',
    'donations',
    'donationsleaderboard',
    'minecraft',
  ]) {
    const { interaction, replies } = mockInteraction(command, { username: 'Player' });
    await lookup(interaction, roblox, easypos, minecraft);
    assertEmbeds(replies);
  }
});

test('long fenced answers remain bounded and user text cannot inject mentions', () => {
  for (const chunk of splitAnswer('```js\n' + 'console.log(1);\n'.repeat(2000) + '```')) {
    assert.ok(chunk.length <= 3500);
    assert.equal((chunk.match(/^```/gm) || []).length % 2, 0);
  }
  for (const chunk of splitAnswer('```' + 'a'.repeat(5000) + '\n' + 'b'.repeat(8000)))
    assert.ok(chunk.length <= 3500);
  assert.throws(() => splitAnswer('text', 1), /chunk size/);
  assert.equal(literal('<@123> @everyone *hi*').includes('<@'), false);
});

test('router denies other servers and non-owner ranking changes with embedded errors', async () => {
  const dependencies = { roblox, easypos, minecraft } as unknown as ConstructorParameters<
    typeof Router
  >[2];
  for (const reason of ['guild', 'owner']) {
    const { interaction, raw, replies } = mockInteraction('ranking', {
      sub: 'promote',
      username: 'Player',
    });
    if (reason === 'guild') raw.guildId = '100000000000000002';
    else raw.guild.ownerId = '400000000000000002';
    const router = new Router(config, client, dependencies);
    router.handle(interaction);
    await Promise.all(router.pending);
    assertEmbeds(replies);
    assert.match(
      replies[0]!.embeds[0]!.data.description!,
      reason === 'guild' ? /only in the CityMart server/ : /Only this server’s owner/,
    );
  }
});

test('router acknowledges network commands before calling the integration and ignores replayed interactions', async () => {
  const context = mockInteraction('activity', { username: 'Player' });
  let calls = 0;
  const checked = {
    ...roblox,
    lookup: async () => {
      assert.equal(context.raw.deferred, true);
      calls++;
      return user;
    },
  } as unknown as Roblox;
  const router = new Router(config, client, {
    roblox: checked,
    easypos,
    minecraft,
  } as unknown as ConstructorParameters<typeof Router>[2]);
  router.handle(context.interaction);
  await Promise.all(router.pending);
  router.handle(context.interaction);
  await Promise.all(router.pending);
  assert.equal(calls, 1);
  assert.equal(context.acknowledgements.length, 1);
  assertEmbeds(context.replies);
});

test('CityCraft uses modern labelled modal components and binds submissions to their requester', async () => {
  const citycraft = new Citycraft(client, config);
  const { interaction, raw } = mockInteraction('citycraft');
  let modal: Record<string, unknown> | undefined;
  raw.showModal = async (builder) => {
    modal = builder.toJSON() as Record<string, unknown>;
    return modal;
  };
  await citycraft.show(interaction);
  assert.ok(modal);
  const components = modal.components as { type: number }[];
  assert.ok(components.every((component) => component.type === 18));
  const expired = {
    customId: 'citycraft:expired',
    user: interaction.user,
    guildId,
  } as unknown as Parameters<Citycraft['submit']>[0];
  await assert.rejects(citycraft.submit(expired), /form expired/);
});

test('/user enriches a Discord profile with account and membership details', async () => {
  const context = mockInteraction('user');
  Object.assign(context.raw.guild, {
    members: {
      fetch: async () => ({
        joinedTimestamp: Date.now(),
        roles: { cache: { filter: () => ({ sort: () => ({ map: () => [] }) }) } },
      }),
    },
  });
  Object.assign(context.raw.user, { createdTimestamp: Date.now() - 86_400_000, bot: false });
  await info(context.interaction, config, client, roblox);
  assertEmbeds(context.replies);
  assert.ok(
    context.replies[0]!.embeds[0]!.data.fields?.some((field) => field.name === 'Joined CityMart'),
  );
});

test('private and public /ask requests use separate context identifiers', async () => {
  const keys: string[] = [];
  const ai = {
    ask: async (key: string) => {
      keys.push(key);
      return 'Answer';
    },
  } as unknown as Hallai;
  for (const privateReply of [false, true]) {
    const context = mockInteraction('ask', { prompt: 'Question' });
    context.interaction.ephemeral = privateReply;
    await ask(context.interaction, ai);
  }
  assert.notEqual(keys[0], keys[1]);
  assert.ok(keys[0]!.endsWith(':public'));
  assert.ok(keys[1]!.endsWith(':private'));
});

test('CityCraft delivers an embedded whitelist request once and confirms it privately', async () => {
  const sent: Payload[] = [];
  const bot = {
    users: {
      fetch: async () => ({
        send: async (payload: Payload) => {
          sent.push(payload);
        },
      }),
    },
  } as unknown as Client;
  const citycraft = new Citycraft(bot, config);
  const context = mockInteraction('citycraft');
  let customId = '';
  context.raw.showModal = async (builder) => {
    customId = (builder.toJSON() as { custom_id: string }).custom_id;
    return {};
  };
  await citycraft.show(context.interaction);
  const submit = {
    ...context.raw,
    customId,
    fields: { getTextInputValue: () => 'TestPlayer', getStringSelectValues: () => ['java'] },
  } as unknown as Parameters<Citycraft['submit']>[0];
  await citycraft.submit(submit);
  assertEmbeds(sent);
  assertEmbeds(context.replies);
  await assert.rejects(citycraft.submit(submit), /form expired/);
  assert.equal(sent.length, 1);
});
