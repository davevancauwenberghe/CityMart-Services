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
import { Hallai, HallFailure } from '../src/services/hallai.js';
import { HttpClient } from '../src/services/http.js';
import { CitycraftStatus } from '../src/services/citycraft-status.js';
import type { Roblox } from '../src/services/roblox.js';
import type { Easypos } from '../src/services/easypos.js';
const hallReply = { reply: 'Answer', webSearch: false, contextFresh: false, truncated: false };
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
      assert.ok(data.footer?.text.includes('v1.4.1'));
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
} as unknown as Easypos;
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
    ask: async () => ({ ...hallReply, reply: '```ts\n' + 'const x = 1;\n'.repeat(1200) + '```' }),
  } as unknown as Hallai;
  await ask(interaction, ai);
  assertEmbeds(replies);
  assert.ok(replies[0]!.embeds[0]!.toJSON().description?.includes(literal('*'.repeat(1000), 2050)));
  assert.equal(replies[0]!.embeds.length, 1);
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
  assert.equal(replies[0]!.embeds.length, 1);
  assert.match(replies[0]!.embeds[0]!.data.description!, /Where is my cart/);
  assert.match(replies[0]!.embeds[0]!.data.description!, /Please wait/);
  assert.match(replies[0]!.embeds[0]!.data.description!, /\*\*Status\*\*/);
  assert.doesNotMatch(replies[0]!.embeds[0]!.data.description!, /\*\*Hall’s answer\*\*/);
});

test('/ask includes safe Worker failure references without changing reply privacy', async () => {
  const reference = '815ea786-e3ce-4e10-8e5c-466b8048314c';
  const original = console.error;
  console.error = () => {};
  try {
    for (const privateReply of [false, true]) {
      const context = mockInteraction(
        'ask',
        { prompt: 'Check the sources' },
        { private: privateReply },
      );
      const hallai = {
        ask: async () => {
          throw new HallFailure(503, reference);
        },
      } as unknown as Hallai;
      const router = new Router(config, client, { hallai } as unknown as ConstructorParameters<
        typeof Router
      >[2]);
      router.handle(context.interaction);
      await Promise.all(router.pending);
      assert.equal(context.interaction.ephemeral, privateReply);
      assertEmbeds(context.replies);
      assert.match(
        context.replies[0]!.embeds[0]!.data.description!,
        new RegExp('Reference: ' + reference),
      );
      assert.equal(context.replies[0]!.embeds.length, 1);
    }
  } finally {
    console.error = original;
  }
});

test('/ask setup failures keep one question/status embed and preserve the requested reply privacy', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Unexpected request');
  });
  for (const privateReply of [false, true]) {
    const context = mockInteraction('ask', { prompt: 'Test question' }, { private: privateReply });
    const hallai = new Hallai(new HttpClient('test'), 'https://example.com');
    const router = new Router(config, client, { hallai } as unknown as ConstructorParameters<
      typeof Router
    >[2]);
    router.handle(context.interaction);
    await Promise.all(router.pending);
    assert.equal(context.raw.ephemeral, privateReply);
    assert.equal(context.replies.length, 1);
    assert.equal(context.replies[0]!.embeds.length, 1);
    const description = context.replies[0]!.embeds[0]!.data.description!;
    assert.match(description, /Test question/);
    assert.match(description, /\*\*Status\*\*/);
    assert.match(description, /Discord connection is not configured/);
    assert.doesNotMatch(description, /\*\*Hall’s answer\*\*|HALLAI_API_KEY|DISCORD_API_KEY/);
    assertEmbeds(context.replies);
  }
  assert.equal(requests, 0);
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
  for (const command of ['memberlookup', 'activity']) {
    const { interaction, replies } = mockInteraction(command, { username: 'Player' });
    await lookup(interaction, roblox, easypos);
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

test('answer splitting preserves source links, small first-embed budgets and surrogate pairs', () => {
  const citation = '[1](https://example.com/reference?details=' + 'a'.repeat(700) + ')';
  for (const prefix of ['Useful context about the question. '.repeat(99), '😀'.repeat(1720)]) {
    const text = prefix + citation;
    const chunks = splitAnswer(text, 3500);
    assert.ok(chunks.every((chunk) => chunk.length <= 3500));
    assert.ok(chunks.some((chunk) => chunk.includes(citation)));
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)));
  }
  const long = '[1](https://example.com/' + 'a'.repeat(2200) + ')';
  const chunks = splitAnswer(long, 1800, 3500);
  assert.equal(chunks[0], 'The answer continues below.');
  assert.equal(chunks[1], long);
  assert.throws(
    () => splitAnswer('[1](https://example.com/' + 'a'.repeat(4000) + ')'),
    /source link/,
  );
});

test('/ask labels search/fresh context, explains truncation and attaches answers whose links exceed embed limits', async () => {
  for (const oversized of [false, true]) {
    const context = mockInteraction('ask', { prompt: 'Search official sources' });
    context.raw.deferred = true;
    const reply = oversized
      ? '[1](https://example.com/' + 'a'.repeat(4000) + ')'
      : 'A sourced reply [1](https://example.com/reference).';
    await ask(context.interaction, {
      ask: async () => ({
        ...hallReply,
        reply,
        webSearch: true,
        contextFresh: true,
        truncated: true,
      }),
    } as unknown as Hallai);
    assertEmbeds(context.replies);
    const first = context.replies[0]!;
    assert.match(first.embeds[0]!.data.description!, /Search official sources/);
    assert.match(first.embeds[0]!.data.footer!.text, /Web search used.*Fresh context/);
    if (oversized) {
      const files = (first as unknown as { files: { attachment: Buffer }[] }).files;
      assert.ok(files[0]!.attachment.toString().includes(reply));
    } else {
      assert.match(first.embeds[0]!.data.footer!.text, /Web search used.*Fresh context/);
      assert.match(first.embeds[0]!.data.description!, /Hall reached its reply limit/);
    }
  }
});

test('/citycraft defers once, shows status and opens its form only through the request button', async () => {
  for (const state of ['online', 'unreachable'] as const) {
    const context = mockInteraction('citycraft');
    const status = new CitycraftStatus({ host: '127.0.0.1', port: 25565 }, async () => {
      assert.equal(context.raw.deferred, true);
      return {
        state,
        checkedAt: Date.now(),
        ...(state === 'online'
          ? { players: { online: 3, max: 20 }, version: 'Paper', latencyMs: 5 }
          : {}),
      };
    });
    const citycraft = new Citycraft(client, config, status);
    let opened = false;
    context.raw.showModal = async () => {
      opened = true;
      return {};
    };
    const router = new Router(config, client, { citycraft } as unknown as ConstructorParameters<
      typeof Router
    >[2]);
    router.handle(context.interaction);
    await Promise.all(router.pending);
    assert.equal(opened, false);
    assertEmbeds(context.replies);
    const fields = context.replies[0]!.embeds[0]!.data.fields!;
    assert.equal(
      fields.find((field) => field.name === 'Server status')!.value,
      state === 'online' ? 'Online' : 'Offline or unreachable',
    );
    const button = (
      context.replies[0]!.components![0] as {
        toJSON: () => { components: { custom_id: string }[] };
      }
    ).toJSON().components[0]!;
    assert.equal(button.custom_id, 'citycraft_whitelist_request');
    context.raw.id = '600000000000000002';
    Object.assign(context.raw, {
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: button.custom_id,
      deferred: false,
      replied: false,
    });
    router.handle(context.interaction);
    await Promise.all(router.pending);
    assert.equal(opened, true);
  }
});

test('router denies commands from other servers with an embedded error', async () => {
  const { interaction, raw, replies } = mockInteraction('activity', { username: 'Player' });
  raw.guildId = '100000000000000002';
  const router = new Router(config, client, { roblox, easypos } as unknown as ConstructorParameters<
    typeof Router
  >[2]);
  router.handle(interaction);
  await Promise.all(router.pending);
  assertEmbeds(replies);
  assert.match(replies[0]!.embeds[0]!.data.description!, /only in the CityMart server/);
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
      return hallReply;
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
  await assert.rejects(
    citycraft.submit({
      ...submit,
      user: { ...submit.user, id: '400000000000000002' },
    } as typeof submit),
    /form expired/,
  );
  await assert.rejects(
    citycraft.submit({ ...submit, guildId: '100000000000000002' } as typeof submit),
    /form expired/,
  );
  assert.equal(sent.length, 0);
  await citycraft.submit(submit);
  assertEmbeds(sent);
  assertEmbeds(context.replies);
  await assert.rejects(citycraft.submit(submit), /form expired/);
  assert.equal(sent.length, 1);
});

test('/ask puts the question and a normal answer in one embed', async () => {
  const context = mockInteraction('ask', { prompt: 'How are you?' });
  await ask(context.interaction, {
    ask: async () => ({ ...hallReply, reply: 'Ready for a good question.' }),
  } as unknown as Hallai);
  assert.equal(context.replies.length, 1);
  assert.equal(context.replies[0]!.embeds.length, 1);
  const description = context.replies[0]!.embeds[0]!.data.description!;
  assert.match(description, /How are you/);
  assert.match(description, /Ready for a good question/);
  assertEmbeds(context.replies);
});

test('/forget chooses the requested context scope and always confirms privately through the router', async () => {
  const keys: string[] = [];
  const hallai = {
    forget: async (key: string) => {
      keys.push(key);
    },
  } as unknown as Hallai;
  for (const privateContext of [false, true]) {
    const context = mockInteraction('forget', {}, { private: privateContext });
    const router = new Router(config, client, { hallai } as unknown as ConstructorParameters<
      typeof Router
    >[2]);
    router.handle(context.interaction);
    await Promise.all(router.pending);
    assert.equal(context.raw.ephemeral, true);
    assertEmbeds(context.replies);
  }
  assert.ok(keys[0]!.endsWith(':public'));
  assert.ok(keys[1]!.endsWith(':private'));
});
