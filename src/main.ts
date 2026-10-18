import { join } from 'node:path';
import { once } from 'node:events';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { readConfig, VERSION, type Config } from './config.js';
import { safeLog } from './core.js';
import { createHealthServer } from './health.js';
import { registerCommands } from './commands.js';
import { HttpClient } from './services/http.js';
import { Roblox } from './services/roblox.js';
import { Easypos } from './services/easypos.js';
import { Minecraft } from './services/minecraft.js';
import { Hallai } from './services/hallai.js';
import { GiveawayStore } from './giveaways/store.js';
import { Giveaways } from './giveaways/service.js';
import { Citycraft } from './handlers/citycraft.js';
import { updateCommunity, announceReady } from './handlers/info.js';
import { Router } from './router.js';

let config: Config;
try {
  config = readConfig();
} catch (error) {
  console.error(
    `Configuration error: ${error instanceof Error ? error.message : 'Invalid environment variables.'}`,
  );
  process.exit(1);
}
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
  rest: { timeout: 15_000, retries: 0 },
});
const http = new HttpClient(config.userAgent);
const store = new GiveawayStore(join(config.dataDir, 'giveaways.json'));
const roblox = new Roblox(http, config);
const giveaways = new Giveaways(store, client, config);
const router = new Router(config, client, {
  roblox,
  easypos: new Easypos(http, config),
  minecraft: new Minecraft(http),
  hallai: new Hallai(http, config.workerUrl, config.hallaiApiKey),
  giveaways,
  citycraft: new Citycraft(client, config),
});
let initialized = false;
let stopping = false;
const health = createHealthServer(() => initialized && client.isReady() && !stopping);
const timers = new Set<NodeJS.Timeout>();
const background = new Set<Promise<void>>();
function repeat(task: () => Promise<void>, ms: number) {
  if (stopping) return;
  const work = (async () => {
    if (client.isReady() && initialized) {
      try {
        await task();
      } catch (error) {
        safeLog('background_task_failed', error);
      }
    }
  })();
  background.add(work);
  void work.finally(() => {
    background.delete(work);
    if (!stopping) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        repeat(task, ms);
      }, ms);
      timers.add(timer);
    }
  });
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  initialized = false;
  router.stopping = true;
  for (const timer of timers) clearTimeout(timer);
  http.close();
  // Docker/Coolify's stop window is finite; don't leave a broken process alive indefinitely.
  const deadline = setTimeout(() => {
    safeLog('shutdown_deadline_exceeded');
    process.exit(1);
  }, 20_000);
  deadline.unref();
  await Promise.allSettled([...router.pending, ...background]);
  await client.destroy();
  await new Promise<void>((resolve) => health.close(() => resolve()));
  clearTimeout(deadline);
  process.exitCode = code;
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
process.on('unhandledRejection', (error) => {
  safeLog('unhandled_rejection', error);
  void shutdown(1);
});
process.on('uncaughtException', (error) => {
  safeLog('uncaught_exception', error);
  void shutdown(1);
});
client.on(Events.Error, (error) => safeLog('discord_error', error));
client.on(Events.ShardError, (error) => safeLog('discord_gateway_error', error));
client.on(Events.InteractionCreate, (interaction) => router.handle(interaction));
try {
  await store.load();
  health.listen(config.port, '0.0.0.0');
  await once(health, 'listening');
  health.on('error', (error) => {
    safeLog('health_server_failed', error);
    void shutdown(1);
  });
  const ready = once(client, Events.ClientReady, { signal: AbortSignal.timeout(60_000) });
  void ready.catch(() => undefined);
  await client.login(config.token);
  await ready;
  if (stopping) throw new Error('Startup cancelled.');
  if (config.clientId && config.clientId !== client.application!.id)
    throw new Error('CLIENT_ID does not match the logged-in bot.');
  await client.guilds.fetch(config.guildId);
  await registerCommands(config, client.application!.id);
  initialized = true;
  console.log(
    `CityMart Services v${VERSION} ready as ${client.user!.tag}. Slash commands registered.`,
  );
  const notice = announceReady(client, config).catch((error) =>
    safeLog('startup_announcement_failed', error),
  );
  background.add(notice);
  void notice.finally(() => background.delete(notice));
  repeat(() => giveaways.tick(), 30_000);
  let previous: number | null = null;
  repeat(async () => {
    previous = await updateCommunity(client, config, roblox, previous);
  }, 15 * 60_000);
} catch (error) {
  safeLog('startup_failed_check_configuration_storage_and_discord_access', error);
  await shutdown(1);
}
