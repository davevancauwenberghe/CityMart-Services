import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../src/services/http.js';
import { Roblox } from '../src/services/roblox.js';
import { Easypos } from '../src/services/easypos.js';
import {
  Minecraft,
  decodeTextureProperty,
  isMinecraftUsername,
  normaliseTextureUrl,
} from '../src/services/minecraft.js';
import { Hallai } from '../src/services/hallai.js';
import { readConfig } from '../src/config.js';
const config = readConfig({
  DISCORD_TOKEN: 'fake',
  GUILD_ID: '100000000000000001',
  EASYPOS_TOKEN: 'activity-key',
  EASYPOS_DONATIONS_TOKEN: 'donation-key',
  EASYPOS_RANKING_TOKEN: 'ranking-key',
  EASYPOS_RANKING_MOD_ID: '123',
});
const http = () => new HttpClient('test');
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

test('Roblox uses username lookup, caches missing users and coalesces requests', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests++;
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body as string), {
      usernames: ['Missing'],
      excludeBannedUsers: false,
    });
    return json({ data: [] });
  });
  const roblox = new Roblox(http(), config);
  await assert.rejects(roblox.lookup('Missing'), /could not be found/);
  await assert.rejects(roblox.lookup('Missing'), /could not be found/);
  assert.equal(requests, 1);
  await assert.rejects(roblox.lookup('display name'), /username/);
});

test('Roblox profile survives a thumbnail outage and handles absent community membership', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('thumbnails.')) throw new Error('no thumbnail');
    if (url.includes('/groups/roles')) return json({ data: [] });
    return json({ id: 123, name: 'Player', displayName: 'Display', created: '2020-01-01' });
  });
  const roblox = new Roblox(http(), config);
  const user = await roblox.profile(123);
  assert.equal(user.name, 'Player');
  assert.equal(user.avatar, null);
  assert.equal(await roblox.role(123), null);
});

test('easyPOS preserves POST contracts and never exposes upstream error bodies', async (t) => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string) });
    assert.equal(init.method, 'POST');
    if (url.includes('leaderboard'))
      return json({ success: true, data: { donations: [{ userId: '123', amount: 10 }] } });
    if (url.includes('ranking')) return json({ success: true, data: { rank: 'Manager' } });
    return json({ success: true, data: { amount: 42 } });
  });
  const easypos = new Easypos(http(), config);
  assert.equal(await easypos.donations(123), 42);
  assert.deepEqual(await easypos.leaderboard(), [{ userId: 123, amount: 10 }]);
  assert.equal(await easypos.rank('promote', 123, 'SC'), 'Manager');
  assert.deepEqual(requests[2]!.body, {
    token: 'ranking-key',
    userId: 123,
    modId: 123,
    scaleCode: 'SC',
  });
  assert.ok(requests[0]!.url.endsWith('/donations/lookup'));
});

test('malformed donation amounts fail safely and ranking timeouts are never retried', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests++;
    if (url.includes('ranking')) throw new Error('token=SECRET');
    return json({ success: true, data: { amount: 'untrusted' } });
  });
  const easypos = new Easypos(http(), config);
  await assert.rejects(easypos.donations(123), /easyPOS request failed/);
  await assert.rejects(easypos.rank('demote', 123, null), /may already have been applied/);
  assert.equal(requests, 2);
});

test('Minecraft validates usernames and only accepts Mojang HTTP(S) texture URLs', () => {
  assert.ok(isMinecraftUsername('jeb_'));
  assert.equal(isMinecraftUsername('853c80ef3c3749fdaa49938b674adae6'), false);
  for (const url of [
    'https://evil.example/texture/a',
    'ftp://textures.minecraft.net/texture/a',
    'https://u:p@textures.minecraft.net/texture/a',
    'https://textures.minecraft.net:444/texture/a',
  ])
    assert.equal(normaliseTextureUrl(url), null);
  const value = Buffer.from(
    JSON.stringify({
      textures: {
        SKIN: { url: 'http://textures.minecraft.net/texture/skin', metadata: { model: 'slim' } },
        CAPE: { url: 'https://textures.minecraft.net/texture/cape' },
      },
    }),
  ).toString('base64');
  assert.deepEqual(decodeTextureProperty(value), {
    skinUrl: 'https://textures.minecraft.net/texture/skin',
    capeUrl: 'https://textures.minecraft.net/texture/cape',
    model: 'Slim (Alex)',
  });
  assert.throws(() => decodeTextureProperty('not JSON'), /Mojang request failed/);
});

test('Minecraft caches the complete lookup and never returns a UUID in its public profile', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests++;
    return url.includes('/lookup/')
      ? json({ id: 'a'.repeat(32), name: 'Player' })
      : json({ properties: [] });
  });
  const minecraft = new Minecraft(http());
  const first = await minecraft.lookup('Player', 'actor');
  await minecraft.lookup('Player', 'actor');
  assert.equal(first.name, 'Player');
  assert.equal(requests, 2);
  assert.equal('id' in first, false);
});

test('hallAI preserves its worker contract, expires context, and reset starts cleanly', async (t) => {
  const bodies: {
    prompt: string;
    identifier: string;
    messages: { role: string; content: string }[];
  }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return new Response('A helpful answer');
  });
  let now = 0;
  const ai = new Hallai(http(), 'https://example.com/worker', () => now);
  await ai.ask('a', 'First?');
  await ai.ask('a', 'Second?');
  assert.equal(bodies[0]!.identifier, 'a');
  assert.equal(bodies[0]!.prompt, 'First?');
  assert.equal(bodies[1]!.messages.length, 4);
  await ai.ask('a', 'Fresh?', true);
  assert.equal(bodies[2]!.messages.length, 2);
  now += 31 * 60_000;
  await ai.ask('a', 'Expired?');
  assert.equal(bodies[3]!.messages.length, 2);
});

test('hallAI rejects overlapping questions rather than mixing conversation histories', async (t) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    await gate;
    return new Response('Answer');
  });
  const ai = new Hallai(http(), 'https://example.com');
  const pending = ai.ask('same', 'First?');
  await assert.rejects(ai.ask('same', 'Second?'), /previous question/);
  release!();
  await pending;
});
