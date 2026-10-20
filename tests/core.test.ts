import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cache, KeyedLock, RateLimit, ServiceError, safeLog } from '../src/core.js';
import { readConfig, guildSettings } from '../src/config.js';
import { REST, Routes } from 'discord.js';
import { giveawayEnd } from '../src/giveaways/time.js';
import { commands, registerCommands } from '../src/commands.js';
const env = { DISCORD_TOKEN: 'test-token', GUILD_ID: '100000000000000001' };

test('validates startup settings while keeping deployed variable names', () => {
  const config = readConfig(env);
  assert.equal(config.timeZone, 'Europe/Brussels');
  assert.equal(config.groupId, '36060455');
  assert.equal(config.citycraftOwnerId, '651525636351066182');
  assert.throws(() => readConfig({ ...env, PORT: '0' }));
  assert.throws(() => readConfig({ ...env, GUILD_ID: 'oops' }));
  assert.throws(() => readConfig({ ...env, WORKER_URL: 'http://example.com' }));
  assert.throws(() => readConfig({ ...env, WORKER_URL: 'https://user:pass@example.com' }));
  assert.throws(() => readConfig({ ...env, TIME_ZONE: 'Moon/CityMart' }));
  assert.throws(() => readConfig({ ...env, CITYCRAFT_STATUS_PORT: '0' }));
  assert.throws(() => readConfig({ ...env, CITYCRAFT_STATUS_HOST: 'http://example.com/' }));
});

test('labs are opt-in, validate IDs and keep per-server settings separate', () => {
  const primary = readConfig(env);
  assert.deepEqual(primary.guildIds, [env.GUILD_ID]);
  assert.throws(() => guildSettings(primary, ''), /not configured/);
  const config = readConfig({
    ...env,
    LAB_GUILD_ID: '100000000000000002',
    SUPPORT_CHANNEL_ID: '200000000000000001',
    GIVEAWAY_MIN_ROLE_ID: '300000000000000001',
    LAB_SUPPORT_CHANNEL_ID: '200000000000000002',
    LAB_GIVEAWAY_MIN_ROLE_ID: '300000000000000002',
  });
  assert.deepEqual(config.guildIds, [env.GUILD_ID, '100000000000000002']);
  assert.deepEqual(guildSettings(config, config.guildId), {
    supportChannelId: '200000000000000001',
    minRoleId: '300000000000000001',
  });
  assert.deepEqual(guildSettings(config, config.labGuildId), {
    supportChannelId: '200000000000000002',
    minRoleId: '300000000000000002',
  });
  const defaults = readConfig({
    ...env,
    LAB_GUILD_ID: config.labGuildId,
    SUPPORT_CHANNEL_ID: config.supportChannelId,
    GIVEAWAY_MIN_ROLE_ID: config.minRoleId,
  });
  assert.deepEqual(guildSettings(defaults, defaults.labGuildId), {
    supportChannelId: '',
    minRoleId: '',
  });
  assert.throws(() => guildSettings(config, '900000000000000001'), /not configured/);
  for (const bad of [
    { LAB_GUILD_ID: 'oops' },
    { LAB_GUILD_ID: env.GUILD_ID },
    { LAB_SUPPORT_CHANNEL_ID: 'oops' },
    { LAB_GIVEAWAY_MIN_ROLE_ID: 'oops' },
    { LAB_SUPPORT_CHANNEL_ID: '200000000000000002' },
    { LAB_GIVEAWAY_MIN_ROLE_ID: '300000000000000002' },
  ])
    assert.throws(() => readConfig({ ...env, ...bad }));
});

test('startup/manual registration replaces commands in each configured server and propagates failures', async (t) => {
  const calls: { route: string; body: unknown }[] = [];
  let fail = false;
  t.mock.method(REST.prototype, 'put', async (route: string, options?: { body?: unknown }) => {
    if (fail && route.includes('100000000000000002')) throw new Error('Labs bot not installed');
    calls.push({ route, body: options?.body });
    return [];
  });
  const applicationId = '500000000000000001';
  for (const labGuildId of ['', '100000000000000002']) {
    calls.length = 0;
    const config = readConfig({ ...env, LAB_GUILD_ID: labGuildId });
    await registerCommands(config, applicationId);
    assert.deepEqual(
      calls.map((call) => call.route),
      config.guildIds.map((id) => Routes.applicationGuildCommands(applicationId, id)),
    );
    assert.ok(calls.every((call) => call.body === commands));
  }
  fail = true;
  await assert.rejects(
    registerCommands(readConfig({ ...env, LAB_GUILD_ID: '100000000000000002' }), applicationId),
    /not installed/,
  );
});

test('negative results are cached and concurrent requests are coalesced', async () => {
  let loads = 0,
    now = 100;
  const cache = new Cache<null>(10, 5, () => now);
  const load = async () => {
    loads++;
    return null;
  };
  assert.deepEqual(await Promise.all([cache.get('x', load), cache.get('x', load)]), [null, null]);
  await cache.get('x', load);
  assert.equal(loads, 1);
  now += 11;
  await cache.get('x', load);
  assert.equal(loads, 2);
});

test('fixed-window limits reset and do not discard active users under pressure', () => {
  let now = 0;
  const rate = new RateLimit(2, 100, 1, () => now);
  rate.take('a');
  rate.take('a');
  assert.throws(() => rate.take('a'), /try again/);
  assert.throws(() => rate.take('b'), /busy/);
  now = 100;
  assert.doesNotThrow(() => rate.take('b'));
});

test('keyed tasks stay ordered and recover after failure', async () => {
  const lock = new KeyedLock(),
    results: number[] = [];
  await Promise.allSettled([
    lock.run('a', async () => {
      results.push(1);
      throw new Error('failure');
    }),
    lock.run('a', async () => {
      results.push(2);
    }),
  ]);
  assert.deepEqual(results, [1, 2]);
});

test('giveaway dates reject rollovers, past dates and ambiguous or skipped DST times', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(giveawayEnd('2h', null, 'Europe/Brussels', now), now + 7_200_000);
  assert.equal(
    giveawayEnd(null, '2026-01-01 14:00', 'Europe/Brussels', now),
    Date.UTC(2026, 0, 1, 13),
  );
  for (const [duration, end] of [
    [null, '2026-02-30 12:00'],
    [null, '2026-03-29 02:30'],
    [null, '2026-10-25 02:30'],
    ['0m', null],
    ['91d', null],
    ['1h', '2026-01-01 14:00'],
    [null, null],
  ] as [string | null, string | null][])
    assert.throws(() => giveawayEnd(duration, end, 'Europe/Brussels', now));
});

test('command registry removes keywords, exposes required upgrades and validates schemas', () => {
  const names = commands.map((command) => command.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of ['keywords', 'donations', 'donationsleaderboard', 'minecraft', 'ranking'])
    assert.equal(names.includes(name), false);
  assert.ok(!commands.find((command) => command.name === 'citycraft')!.options?.length);
  for (const name of ['help', 'ask', 'user', 'giveaway', 'citycraft'])
    assert.ok(names.includes(name));
  const ask = commands.find((command) => command.name === 'ask')!;
  assert.ok(ask.options?.some((option) => option.name === 'reset'));
  assert.ok(ask.options?.some((option) => option.name === 'private'));
  assert.ok(commands.every((command) => command.description.length <= 100));
  assert.ok(commands.every((command) => !('dm_permission' in JSON.parse(JSON.stringify(command)))));
});

test('logs omit upstream bodies, tokens, URL credentials and arbitrary exception messages', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'error', (value: string) => lines.push(value));
  safeLog('request_failed', new Error('token=VERY_SECRET&prompt=private'));
  safeLog('request_failed', new ServiceError('easyPOS', 429));
  assert.ok(!lines.join('').includes('VERY_SECRET'));
  assert.ok(!lines.join('').includes('private'));
  assert.equal(JSON.parse(lines[1]!).status, 429);
});
