import { resolve } from 'node:path';
import { IANAZone } from 'luxon';

export const VERSION = '1.4.0';
export const isSnowflake = (value: string) => /^[1-9]\d{16,19}$/.test(value);

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
  };
  const id = (name: string, fallback = '') => {
    const value = env[name]?.trim() || fallback;
    if (value && !isSnowflake(value)) throw new Error(`${name} must be a Discord ID.`);
    return value;
  };
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const timeZone = env.TIME_ZONE?.trim() || 'Europe/Brussels';
  if (!IANAZone.isValidZone(timeZone)) throw new Error('Invalid TIME_ZONE.');
  const workerUrl = env.WORKER_URL?.trim() || '';
  if (workerUrl) {
    let url: URL;
    try {
      url = new URL(workerUrl);
    } catch {
      throw new Error('WORKER_URL must be a valid HTTPS URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('WORKER_URL must use HTTPS without credentials in the URL.');
  }
  const groupId = env.ROBLOX_GROUP_ID?.trim() || '36060455';
  if (!/^[1-9]\d{0,14}$/.test(groupId) || !Number.isSafeInteger(Number(groupId)))
    throw new Error('Invalid ROBLOX_GROUP_ID.');
  const rankingModId = env.EASYPOS_RANKING_MOD_ID?.trim() || '';
  if (
    rankingModId &&
    (!/^[1-9]\d{0,14}$/.test(rankingModId) || !Number.isSafeInteger(Number(rankingModId)))
  )
    throw new Error('Invalid EASYPOS_RANKING_MOD_ID.');
  const guildId = id('GUILD_ID');
  if (!guildId) throw new Error('Missing GUILD_ID.');
  return {
    token: required('DISCORD_TOKEN'),
    clientId: id('CLIENT_ID'),
    guildId,
    port,
    timeZone,
    dataDir: resolve(env.DATA_DIR || '/data'),
    workerUrl,
    groupId,
    supportChannelId: id('SUPPORT_CHANNEL_ID'),
    generalChannelId: id('GENERAL_CHANNEL_ID'),
    commandsChannelId: id('COMMANDS_CHANNEL_ID'),
    minRoleId: id('GIVEAWAY_MIN_ROLE_ID'),
    citycraftOwnerId: id('CITYCRAFT_OWNER_USER_ID', '651525636351066182'),
    citycraftAddress: env.CITYCRAFT_ADDRESS?.trim() || 'citycraft.davevancauwenberghe.be',
    easyposToken: env.EASYPOS_TOKEN?.trim() || '',
    donationsToken: env.EASYPOS_DONATIONS_TOKEN?.trim() || '',
    rankingToken: env.EASYPOS_RANKING_TOKEN?.trim() || '',
    rankingModId,
    userAgent:
      env.USER_AGENT?.trim() ||
      `CityMart-Services/${VERSION} (+https://github.com/davevancauwenberghe/CityMart-Services)`,
  };
}
export type Config = ReturnType<typeof readConfig>;
