import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../src/services/http.js';
import { Roblox } from '../src/services/roblox.js';
import { Easypos } from '../src/services/easypos.js';
import { Hallai, HallFailure } from '../src/services/hallai.js';
import { readConfig } from '../src/config.js';
import { UserError } from '../src/core.js';
const config = readConfig({
  DISCORD_TOKEN: 'fake',
  GUILD_ID: '100000000000000001',
  EASYPOS_TOKEN: 'activity-key',
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

test('easyPOS activity keeps its POST contract and safe field validation', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://papi.easypos.lol/activity/data');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body as string), { token: 'activity-key', userId: 123 });
    return json({
      success: true,
      data: {
        inGame: true,
        playtime: { formatted: { total: '2h' }, position: 1 },
        messages: { total: 4 },
      },
    });
  });
  const data = await new Easypos(http(), config).activity(123);
  assert.equal(data.inGame, true);
  assert.equal(data.playtime.total, '2h');
  assert.equal(data.messages.total, 4);
  assert.equal(data.playtime.month, 'Not available');
});

test('easyPOS activity failures never expose upstream response bodies', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('SECRET_TOKEN', { status: 500 }));
  await assert.rejects(
    new Easypos(http(), config).activity(123),
    (error) => error instanceof Error && !error.message.includes('SECRET_TOKEN'),
  );
});

const hallKey = '100000000000000001:200000000000000001:400000000000000001:public';

test('Hall retains safe search/context/truncation metadata and rejects oversized replies without cutting source links', async (t) => {
  let reply = 'See [1](https://example.com/source).';
  t.mock.method(globalThis, 'fetch', async () =>
    json({
      reply,
      memory: 'session',
      web_search: true,
      context_fresh: true,
      truncated: true,
      safety: 'checked',
      request_id: '23d8bccc-8827-42c3-88af-0a67efcbd6ea',
    }),
  );
  const ai = new Hallai(http(), 'https://example.com', 'integration-secret');
  assert.deepEqual(await ai.ask(hallKey, 'Search please'), {
    reply,
    webSearch: true,
    contextFresh: true,
    truncated: true,
    safety: 'checked',
    requestId: '23d8bccc-8827-42c3-88af-0a67efcbd6ea',
  });
  reply = 'a'.repeat(16_001);
  await assert.rejects(ai.ask(hallKey, 'Oversized'), /hallAI request failed/);
});

test('Hall error references are allowlisted independently from untrusted error messages', async (t) => {
  let reference = '23d8bccc-8827-42c3-88af-0a67efcbd6ea';
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ request_id: reference, error: { message: 'SECRET_BODY' } }, { status: 503 }),
  );
  const ai = new Hallai(http(), 'https://example.com', 'integration-secret');
  await assert.rejects(
    ai.ask(hallKey, 'Question'),
    (error) =>
      error instanceof HallFailure &&
      error.reference === reference &&
      !error.message.includes('SECRET_BODY'),
  );
  reference = 'SECRET_BAD_ID';
  await assert.rejects(
    ai.ask(hallKey, 'Question'),
    (error) => error instanceof HallFailure && error.reference === undefined,
  );
});

test('Hall setup warnings identify incomplete runtime configuration without exposing credentials', () => {
  assert.equal(new Hallai(http(), '').configurationWarning, undefined);
  const missingKey = new Hallai(http(), 'https://example.com').configurationWarning!;
  assert.match(missingKey, /HALLAI_API_KEY is missing/);
  assert.match(missingKey, /Worker's DISCORD_API_KEY/);
  assert.match(missingKey, /production runtime/);
  assert.match(missingKey, /redeploy/);
  const missingUrl = new Hallai(http(), '', 'secret-fixture').configurationWarning!;
  assert.match(missingUrl, /WORKER_URL is missing/);
  assert.ok(!missingUrl.includes('secret-fixture'));
  const configured = readConfig({
    DISCORD_TOKEN: 'fake',
    GUILD_ID: config.guildId,
    WORKER_URL: ' https://example.com ',
    HALLAI_API_KEY: ' integration-secret ',
  });
  assert.equal(configured.hallaiApiKey, 'integration-secret');
  assert.equal(configured.workerUrl, 'https://example.com');
  assert.equal(
    new Hallai(http(), configured.workerUrl, configured.hallaiApiKey).configurationWarning,
    undefined,
  );
});

test('incomplete Hall setup blocks public/private ask and forget before making any HTTP request', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('Unexpected request');
  });
  for (const [url, secret] of [
    ['', ''],
    ['https://example.com', ''],
    ['', 'secret-fixture'],
  ]) {
    const ai = new Hallai(http(), url!, secret!);
    for (const scope of ['public', 'private']) {
      const key = hallKey.replace(/public$/, scope);
      for (const action of [() => ai.ask(key, 'Question'), () => ai.forget(key)])
        await assert.rejects(action, (error) => {
          assert.ok(error instanceof UserError);
          assert.match(error.message, /Discord connection is not configured/);
          assert.ok(!error.message.includes('private conversation memory'));
          assert.ok(!error.message.includes('secret-fixture'));
          return true;
        });
    }
  }
  assert.equal(requests, 0);
});

test('hallAI sends authenticated identities and lets the Worker own persistent context', async (t) => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      'Bearer integration-secret',
    );
    requests.push({ url, body: JSON.parse(init.body as string) });
    return json(
      url.endsWith('/api/reset') ? { ok: true } : { reply: 'A helpful answer', memory: 'session' },
    );
  });
  const ai = new Hallai(http(), 'https://example.com', 'integration-secret');
  await ai.ask(hallKey, 'First?');
  await ai.ask(hallKey, 'Second?');
  const restarted = new Hallai(http(), 'https://example.com', 'integration-secret');
  await restarted.ask(hallKey, 'After restart?');
  assert.equal(requests[0]!.url, 'https://example.com/api/chat');
  assert.equal(requests[0]!.body.source, 'discord');
  assert.equal(requests[0]!.body.user_id, '400000000000000001');
  assert.equal(requests[0]!.body.channel_id, '200000000000000001');
  assert.equal(requests[0]!.body.visibility, 'public');
  assert.equal(requests[0]!.body.prompt, 'First?');
  assert.equal(requests[0]!.body.messages, undefined);
  assert.equal(requests[0]!.body.user_id, requests[2]!.body.user_id);
  assert.notEqual(requests[0]!.body.request_id, requests[1]!.body.request_id);
  await ai.ask(hallKey, 'Fresh?', true);
  assert.ok(requests[3]!.url.endsWith('/api/reset'));
  assert.ok(requests[4]!.url.endsWith('/api/chat'));
  await ai.forget(hallKey);
  assert.ok(requests[5]!.url.endsWith('/api/reset'));
});

test('hallAI rejects overlapping questions rather than mixing conversation histories', async (t) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    await gate;
    return json({ reply: 'Answer', memory: 'session' });
  });
  const ai = new Hallai(http(), 'https://example.com', 'integration-secret');
  const pending = ai.ask(hallKey, 'First?');
  await assert.rejects(ai.ask(hallKey, 'Second?'), /previous question/);
  await assert.rejects(ai.forget(hallKey), /previous question/);
  release!();
  await pending;
});

test('Hall rejects stateless responses and never exposes upstream error bodies', async (t) => {
  let status = 200;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        status === 200 ? JSON.stringify({ reply: 'Answer', memory: 'none' }) : 'SECRET_TOKEN',
        { status },
      ),
  );
  const ai = new Hallai(http(), 'https://example.com', 'integration-secret');
  await assert.rejects(ai.ask(hallKey, 'No context'), /hallAI request failed/);
  status = 500;
  await assert.rejects(
    ai.ask(hallKey, 'Provider error'),
    (error) => error instanceof Error && !error.message.includes('SECRET_TOKEN'),
  );
  status = 429;
  await assert.rejects(ai.ask(hallKey, 'Rate limit'), /message limit/);
  await assert.rejects(ai.ask('invalid', 'Wrong identity'), /could not be identified/);
});

test('Hall reports rejected integration credentials safely and never retries without authentication', async (t) => {
  const requests: string[] = [],
    logs: string[] = [];
  let status = 401;
  t.mock.method(console, 'error', (value: string) => logs.push(value));
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push(url);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer secret-fixture');
    return new Response('SECRET_UPSTREAM_BODY', { status });
  });
  for (status of [401, 403]) {
    const ai = new Hallai(http(), 'https://example.com', 'secret-fixture');
    for (const action of [
      () => ai.ask(hallKey, 'PRIVATE_PROMPT'),
      () => ai.ask(hallKey, 'PRIVATE_PROMPT', true),
      () => ai.forget(hallKey),
    ])
      await assert.rejects(action, (error) => {
        assert.ok(error instanceof UserError);
        assert.match(error.message, /Discord connection was refused/);
        assert.ok(!/SECRET_UPSTREAM_BODY|secret-fixture/.test(error.message));
        return true;
      });
  }
  assert.deepEqual(
    requests.map((url) => new URL(url).pathname),
    ['/api/chat', '/api/reset', '/api/reset', '/api/chat', '/api/reset', '/api/reset'],
  );
  assert.equal(logs.length, 6);
  for (const log of logs) {
    const entry = JSON.parse(log);
    assert.equal(entry.service, 'hallAI');
    assert.ok([401, 403].includes(entry.status));
    assert.match(entry.event, /matching_integration_secrets/);
    assert.ok(!/SECRET_UPSTREAM_BODY|secret-fixture|PRIVATE_PROMPT|https:/.test(log));
  }
});
