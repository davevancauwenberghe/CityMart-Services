// index.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require('discord.js');
const http = require('http');
const fs   = require('fs');
const path = require('path');

// ---------------------- CityMart Giveaways ----------------------
const GIVEAWAYS_FILE = path.join('/data', 'giveaways.json');

// Map<messageId, Giveaway>
/*
  Giveaway = {
    messageId: string,
    channelId: string,
    guildId: string,
    prize: string,
    endAt: number,          // timestamp (ms)
    createdBy: string,      // userId
    entrants: string[],     // userIds
    ended: boolean,
    winnerId: string | null
  }
*/
const giveaways = new Map();

function loadGiveawaysFromDisk() {
  try {
    if (!fs.existsSync(GIVEAWAYS_FILE)) return;
    const raw = fs.readFileSync(GIVEAWAYS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    for (const [messageId, g] of Object.entries(obj)) {
      giveaways.set(messageId, {
        messageId,
        channelId: g.channelId,
        guildId: g.guildId,
        prize: g.prize,
        endAt: Number(g.endAt) || 0,
        createdBy: g.createdBy,
        entrants: Array.isArray(g.entrants) ? g.entrants : [],
        ended: Boolean(g.ended),
        winnerId: g.winnerId || null
      });
    }
    console.log(`✅ Loaded ${giveaways.size} giveaways from disk`);
  } catch (err) {
    console.error('⚠️ Failed to load giveaways:', err);
  }
}

function saveGiveawaysToDisk() {
  try {
    const obj = {};
    for (const [messageId, g] of giveaways.entries()) {
      obj[messageId] = {
        channelId: g.channelId,
        guildId: g.guildId,
        prize: g.prize,
        endAt: g.endAt,
        createdBy: g.createdBy,
        entrants: g.entrants,
        ended: g.ended,
        winnerId: g.winnerId
      };
    }
    fs.mkdirSync(path.dirname(GIVEAWAYS_FILE), { recursive: true });
    fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Failed to save giveaways:', err);
  }
}

// Parse "YYYY-MM-DD HH:mm" -> timestamp (ms)
function parseGiveawayEnd(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return null;

  const year   = Number(m[1]);
  const month  = Number(m[2]) - 1; // 0-based
  const day    = Number(m[3]);
  const hour   = Number(m[4]);
  const minute = Number(m[5]);

  const date = new Date(year, month, day, hour, minute, 0, 0);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  return ms;
}

// Button entry handler
async function handleGiveawayEnterButton(interaction) {
  const msg = interaction.message;
  if (!msg || !msg.id) {
    return interaction.reply({ content: 'This giveaway is no longer valid.', ephemeral: true });
  }

  const giveaway = giveaways.get(msg.id);
  if (!giveaway) {
    return interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
  }

  if (giveaway.ended || Date.now() >= giveaway.endAt) {
    return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
  }

  if (!giveaway.entrants.includes(interaction.user.id)) {
    giveaway.entrants.push(interaction.user.id);
    saveGiveawaysToDisk();
    return interaction.reply({ content: '🎉 You are now entered in this giveaway!', ephemeral: true });
  } else {
    return interaction.reply({ content: 'You are already entered in this giveaway.', ephemeral: true });
  }
}

async function endGiveaway(messageId, giveaway, { reroll = false } = {}) {
  // If first time ending, choose winner
  if (!giveaway.ended && !reroll) {
    giveaway.ended = true;
  }

  if (giveaway.entrants.length === 0) {
    giveaway.winnerId = null;
  } else {
    // If reroll, pick a new winner (can be same, we keep it simple)
    const idx = Math.floor(Math.random() * giveaway.entrants.length);
    giveaway.winnerId = giveaway.entrants[idx];
  }

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (msg) {
        const baseEmbed = msg.embeds?.[0];
        const embed = new EmbedBuilder(baseEmbed ?? {})
          .setColor(0x00ff88)
          .setTitle(reroll ? '🎁 CityMart Giveaway — Rerolled' : '🎁 CityMart Giveaway — Ended');

        const lines = [
          `Prize: **${giveaway.prize}**`,
          giveaway.entrants.length
            ? `Entries: **${giveaway.entrants.length}**`
            : 'Entries: **0**'
        ];

        if (giveaway.winnerId) {
          lines.push(`Winner: <@${giveaway.winnerId}> 🎉`);
        } else {
          lines.push('No winner could be chosen (no valid entries).');
        }

        embed.setDescription(lines.join('\n'));

        await msg.edit({
          embeds: [embed],
          components: [] // remove the enter button
        });

        if (giveaway.winnerId) {
          await channel.send(
            reroll
              ? `🎲 New winner for **${giveaway.prize}**: <@${giveaway.winnerId}>!`
              : `🎉 Congratulations <@${giveaway.winnerId}>! You won **${giveaway.prize}**!`
          );
        } else if (!reroll) {
          await channel.send('No winner could be chosen for this giveaway.');
        }
      }
    }
  } catch (err) {
    console.error('Error ending/rerolling giveaway message:', err);
  }

  giveaways.set(messageId, giveaway);
  saveGiveawaysToDisk();
}

async function checkGiveaways() {
  const now = Date.now();
  for (const [messageId, g] of giveaways.entries()) {
    if (g.ended) continue;
    if (now >= g.endAt) {
      await endGiveaway(messageId, g, { reroll: false });
      g.ended = true;
    }
  }
}

// Load on startup and schedule periodic checks (120s)
loadGiveawaysFromDisk();
setInterval(() => {
  checkGiveaways().catch(err => console.error('checkGiveaways error:', err));
}, 120_000);

// ---------------------- Cooldowns & Rate Limits ----------------------
const userCooldowns = new Map();
const COOLDOWN_MS   = 5000; // generic per-user cooldown for mentions/slash

// /ask-specific burst limit: 5 reqs / 60s per (guild:channel:user)
const ASK_WINDOW_MS = 60_000;
const ASK_MAX       = 5;
const askBuckets    = new Map(); // key -> [timestamps]

// /members-specific: 1 req / 30s per user
const MEMBERS_WINDOW_MS = 30_000;
const membersBuckets = new Map(); // userId -> lastTimestamp

// tiny in-memory history for /ask (per conversation)
const MAX_TURNS   = 8; // 8 user+assistant pairs
const askHistory  = new Map(); // key -> [{role, content}, ...]
function askKey(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}
function allowAsk(key) {
  const now = Date.now();
  const arr = (askBuckets.get(key) || []).filter(ts => now - ts < ASK_WINDOW_MS);
  if (arr.length >= ASK_MAX) return false;
  arr.push(now);
  askBuckets.set(key, arr);
  return true;
}
function getHistory(key) {
  return askHistory.get(key) || [];
}
function pushTurn(key, userText, assistantText) {
  const prev = getHistory(key);
  const next = [...prev, { role: 'user', content: userText }, { role: 'assistant', content: assistantText }];
  askHistory.set(key, next.slice(-MAX_TURNS * 2));
}
function allowMembersCheck(userId) {
  const last = membersBuckets.get(userId) || 0;
  const now = Date.now();
  if (now - last < MEMBERS_WINDOW_MS) return false;
  membersBuckets.set(userId, now);
  return true;
}

// Periodic cleanup of stale maps (memory hygiene)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1h
  for (const [uid, ts] of userCooldowns) if (ts < cutoff) userCooldowns.delete(uid);

  for (const [key, stamps] of askBuckets) {
    const pruned = stamps.filter(t => Date.now() - t < ASK_WINDOW_MS);
    if (pruned.length) askBuckets.set(key, pruned);
    else askBuckets.delete(key);
  }
  // membersBuckets: keep lightweight; no need to prune aggressively
}, 30 * 60 * 1000);

// ---------------------- Environment ----------------------
const {
  DISCORD_TOKEN,
  GUILD_ID,
  WORKER_URL,
  SUPPORT_CHANNEL_ID,
  GENERAL_CHANNEL_ID,
  COMMANDS_CHANNEL_ID,
  ROBLOX_GROUP_ID,
  BOT_URL,
  USER_AGENT // optional override for outbound HTTP requests
} = process.env;

if (!DISCORD_TOKEN)       console.warn('⚠️ DISCORD_TOKEN is not set; bot login will fail.');
if (!GUILD_ID)            console.warn('⚠️ GUILD_ID is not set; some links (like support) may be invalid.');
if (!WORKER_URL)          console.warn('⚠️ WORKER_URL is not set; /ask will fail.');
if (!SUPPORT_CHANNEL_ID)  console.warn('⚠️ SUPPORT_CHANNEL_ID is not set.');
if (!GENERAL_CHANNEL_ID)  console.warn('⚠️ GENERAL_CHANNEL_ID is not set.');
if (!COMMANDS_CHANNEL_ID) console.warn('⚠️ COMMANDS_CHANNEL_ID is not set (Roblox tracker + toasts).');
if (!ROBLOX_GROUP_ID)     console.warn('⚠️ ROBLOX_GROUP_ID is not set (Roblox tracker + /communitycount + memberlookup badge).');
if (!BOT_URL)             console.warn('⚠️ BOT_URL is not set; help/Dashboard link will be plain text.');

// Polite identification for outbound requests
const OUTBOUND_UA = USER_AGENT || 'CityMartServicesBot/1.0 (+https://citymart-bot.fly.dev)';

// ---------------------- Discord Client ----------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------------- Constants ----------------------
const THUMBNAIL_URL = 'https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png';

// Custom emojis
const CITYMART_EMOJI_RAW = '<:citymart:1400628955253575711>';
const LAMP_EMOJI_RAW     = '<:lamp:1402100477134508222>';
const CITYMART_EMOJI     = /^<a?:\w+:\d+>$/.test(CITYMART_EMOJI_RAW) ? CITYMART_EMOJI_RAW : '🛒';
const LAMP_EMOJI         = /^<a?:\w+:\d+>$/.test(LAMP_EMOJI_RAW)    ? LAMP_EMOJI_RAW    : '💡';

// Reaction keywords
const REACTION_KEYWORDS = ['shopping','mart','cart','shop','store','lamp','citymart'];

// Utility to escape regex special chars (from your utils)
const escapeForRegex = require('./utils/escapeForRegex');

// ---------------------- Small cache (5 min TTL) ----------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { value, expires }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value, ttl = CACHE_TTL_MS) {
  cache.set(key, { value, expires: Date.now() + ttl });
}

// ---------------------- Roblox helpers (memberlookup) ----------------------
async function robloxUsernameToId(username) {
  const key = `uname:${username.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': OUTBOUND_UA },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  if (!res.ok) throw new Error(`Roblox username lookup failed (${res.status})`);
  const data = await res.json();
  const id = data?.data?.[0]?.id ?? null;
  cacheSet(key, id);
  return id;
}

async function robloxUserInfo(userId) {
  const key = `user:${userId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
    headers: { 'User-Agent': OUTBOUND_UA }
  });
  if (!res.ok) throw new Error(`Roblox user info failed (${res.status})`);
  const info = await res.json();
  cacheSet(key, info);
  return info;
}

async function robloxAvatarThumb(userId) {
  const key = `avatar:${userId}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`;
  const res = await fetch(url, { headers: { 'User-Agent': OUTBOUND_UA } });
  if (!res.ok) { cacheSet(key, null); return null; }
  const data = await res.json();
  const imageUrl = data?.data?.[0]?.imageUrl ?? null;
  cacheSet(key, imageUrl);
  return imageUrl;
}

// ⭐ CityMart group role lookup
async function robloxGroupRole(userId, groupId) {
  const key = `role:${userId}:${groupId}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const url = `https://groups.roblox.com/v1/users/${userId}/groups/roles`;
  const res = await fetch(url, { headers: { 'User-Agent': OUTBOUND_UA } });
  if (!res.ok) { cacheSet(key, null); return null; }

  const data = await res.json();
  const groupInfo = Array.isArray(data?.data)
    ? data.data.find(g => String(g.group?.id) === String(groupId))
    : null;
  const role = groupInfo?.role || null;

  cacheSet(key, role);
  return role;
}

// No footer about group membership anymore
function buildMemberLookupEmbed(info, avatarUrl /*, inGroup */) {
  const profileUrl = `https://www.roblox.com/users/${info.id}/profile`;
  const joined = new Date(info.created);
  const embed = new EmbedBuilder()
    .setTitle(`Roblox: ${info.displayName ?? info.name}`)
    .setURL(profileUrl)
    .setThumbnail(avatarUrl || THUMBNAIL_URL)
    .setColor(0x00AEFF)
    .addFields(
      { name: 'Username', value: info.name, inline: true },
      { name: 'User ID', value: String(info.id), inline: true },
      {
        name: 'Joined',
        value: joined.toLocaleString('en-GB', { timeZone: 'Europe/Brussels' }),
        inline: true
      }
    )
    .setTimestamp();

  // NEW: CityMart role display
  if (info.citymartRole) {
    embed.addFields({
      name: 'CityMart Role',
      value: `${info.citymartRole.name} (Rank: ${info.citymartRole.rank})`,
      inline: true
    });
  } else {
    embed.addFields({
      name: 'CityMart Role',
      value: '❌ Not a member of CityMart Group',
      inline: true
    });
  }

  const desc = (info.description || '').trim();
  if (desc) {
    embed.addFields({
      name: 'Bio',
      value: desc.length > 1024 ? desc.slice(0, 1015) + '…' : desc
    });
  }

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Profile')
        .setStyle(ButtonStyle.Link)
        .setURL(profileUrl)
    )
  ];
  return { embed, components };
}

// ---------------------- Triggers ----------------------
const TRIGGERS = [
  {
    keyword: 'community',
    regex: new RegExp(`\\b${escapeForRegex('community')}\\b`, 'i'),
    url: 'https://www.roblox.com/communities/36060455/CityMart-Group#!/about',
    buttonLabel: 'Open Roblox Community',
    embed: new EmbedBuilder()
      .setTitle('CityMart Community')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Hey there! 👋 Join our Roblox Community to chat with fellow CityMart shoppers, share tips, and stay up-to-date on all our events.')
      .setURL('https://www.roblox.com/communities/36060455/CityMart-Group#!/about')
      .setTimestamp()
  },
  {
    keyword: 'experience',
    regex: new RegExp(`\\b${escapeForRegex('experience')}\\b`, 'i'),
    url: 'https://www.roblox.com/games/84931510725955/CityMart-Shopping',
    buttonLabel: 'Open Experience',
    embed: new EmbedBuilder()
      .setTitle('CityMart Shopping Experience')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Ready for a shopping spree? 🛒 Visit our virtual CityMart store on Roblox and explore hundreds of items!')
      .setURL('https://www.roblox.com/games/84931510725955/CityMart-Shopping')
      .setTimestamp()
  },
  {
    keyword: 'application',
    regex: new RegExp(`\\b${escapeForRegex('application')}\\b`, 'i'),
    url: 'https://www.roblox.com/games/138757153564625/CityMart-Application-Centre',
    buttonLabel: 'Open Application Centre',
    embed: new EmbedBuilder()
      .setTitle('CityMart Application Centre')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Apply to work with the CityMart Group via our Application Centre on Roblox.')
      .setURL('https://www.roblox.com/games/138757153564625/CityMart-Application-Centre')
      .setTimestamp()
  },
  {
    keyword: 'support',
    regex: new RegExp(`\\b${escapeForRegex('support')}\\b`, 'i'),
    embed: new EmbedBuilder()
      .setTitle('Need Help?')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('If you’re stuck or have questions, click the button below to jump to our support channel!')
      .setColor(0xff9900)
      .setTimestamp()
  },
  {
    keyword: 'documentation',
    regex: new RegExp(`\\b${escapeForRegex('documentation')}\\b`, 'i'),
    url: 'https://citymartgroup.gitbook.io/docs/',
    buttonLabel: 'Open Documentation',
    embed: new EmbedBuilder()
      .setTitle('CityMart Documentation')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Browse our official docs for guidelines, processes, and more.')
      .setURL('https://citymartgroup.gitbook.io/docs/')
      .setTimestamp()
  },
  {
    keyword: 'lorebook',
    regex: new RegExp(`\\b${escapeForRegex('lorebook')}\\b`, 'i'),
    url: 'https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2?v=23eee5e2e2ec804aa1b3000c2018e0b9',
    buttonLabel: 'Open Lorebook',
    embed: new EmbedBuilder()
      .setTitle('CityMart Lore Book')
      .setThumbnail(THUMBNAIL_URL)
      .setColor(0x00AEFF)
      .setDescription('Dive deeper into the history, secrets, and unprecedented lore of CityMart in our official Lore Book.')
      .setURL('https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2?v=23eee5e2e2ec804aa1b3000c2018e0b9')
      .setFooter({ text: 'CityMart Lore' })
      .setTimestamp()
  },
  {
    keyword: 'lamp',
    regex: new RegExp(`\\b${escapeForRegex('lamp')}\\b`, 'i'),
    embed: new EmbedBuilder()
      .setTitle('About the Lamp')
      .setColor(0xFFD700)
      .setDescription(
        "💡 We don't talk about the lamp. The lamp doesn't exist.\n\n" +
        "Ever since that malicious lamp script from the Roblox toolbox infiltrated CityMart, " +
        "no one dares mention it again. Handle with caution!"
      )
      .setImage('https://storage.davevancauwenberghe.be/citymart/visuals/lamp.png')
      .setFooter({ text: 'Shh... the lamp is gone' })
      .setTimestamp()
  }
];

const LAMP_TRIGGER = TRIGGERS.find(t => t.keyword === 'lamp');

// ---------------------- Help Embed ----------------------
const HELP_EMBED = new EmbedBuilder()
  .setTitle('CityMart Services Help')
  .setThumbnail(THUMBNAIL_URL)
  .setColor(0x00FFAA)
  .setDescription('Use @CityMart Services <keyword> or slash commands to interact.')
  .addFields(
    { name: '🔗 Roblox Links', value: 'community\nexperience\napplication', inline: false },
    { name: '🆘 Support',      value: 'support\ndocumentation',             inline: false },
    { name: '📖 Misc',         value: 'lorebook\nlamp\nping\nask\ncommunitycount\nmemberlookup <username>', inline: false },
    { name: '🔗 Dashboard',    value: BOT_URL ? `[Bot Dashboard](${BOT_URL})` : 'Bot Dashboard', inline: false }
  )
  .setFooter({ text: 'Need help? Ping CityMart Services with a keyword or use /keywords' })
  .setTimestamp();

// ---------------------- Helpers ----------------------
function createSupportRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Go to Support')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${SUPPORT_CHANNEL_ID}`)
  );
}
function createLinkRow(url, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)
  );
}

// ---------------------- Roblox member count tracker ----------------------
let lastMemberCount = null;
const COMMUNITY_URL = 'https://www.roblox.com/communities/36060455/CityMart-Group#!/about';

function updatePresence() {
  if (!client.user) return;

  const label =
    (lastMemberCount !== null && Number.isFinite(lastMemberCount))
      ? `${lastMemberCount.toLocaleString()} Shoppers`
      : 'CityMart Shoppers 🛒';

  client.user.setPresence({
    activities: [{ name: label, type: ActivityType.Watching }],
    status: 'online'
  });
}

async function fetchRobloxMemberCount(groupId) {
  // Public endpoint: https://groups.roblox.com/v1/groups/{groupId}
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': OUTBOUND_UA }
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Roblox API HTTP ${res.status}`);
    const data = await res.json();
    const count = Number(data?.memberCount);
    if (!Number.isFinite(count)) throw new Error('memberCount not found');
    return count;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function pollRobloxMembers() {
  if (!ROBLOX_GROUP_ID || !COMMANDS_CHANNEL_ID) return;
  try {
    const current = await fetchRobloxMemberCount(ROBLOX_GROUP_ID);

    if (lastMemberCount === null) {
      // first sync: set count, update presence, no announcement
      lastMemberCount = current;
      updatePresence();
      return;
    }

    if (current !== lastMemberCount) {
      const diff = current - lastMemberCount;
      lastMemberCount = current;

      // update presence whenever the count changes
      updatePresence();

      const channel = await client.channels.fetch(COMMANDS_CHANNEL_ID).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const growing = diff > 0;
      const abs = Math.abs(diff);
      const title = growing
        ? `🎉 New ${abs === 1 ? 'member has' : `${abs} members have`} joined the Roblox Community!`
        : `👋 ${abs === 1 ? 'A member has' : `${abs} members have`} left the Roblox Community.`;

      const color = growing ? 0x38a34a : 0xd9534f;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`Current member count: **${current.toLocaleString()}**`)
        .setURL(COMMUNITY_URL)
        .setThumbnail(THUMBNAIL_URL)
        .setTimestamp();

      const row = createLinkRow(COMMUNITY_URL, 'Open Roblox Community');
      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    // Silent-ish; log to console but do not spam Discord
    console.error('Roblox tracker error:', err?.message || err);
  }
}

// ---------------------- Lifecycle ----------------------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Initial presence (before we know the member count)
  updatePresence();

  // Presence refresh for resilience (uses same helper)
  setInterval(() => {
    updatePresence();
  }, 10 * 60 * 1000);

  // Fun randomized "I'm back!" message to #general
  const comebackLines = [
    "Beep boop, system reboot complete. I'm back online!",
    "Well, that was a nice nap. Ready to serve again! 🛒",
    "Guess who just reconnected? Hint: it’s me.",
    "Downtime? Never heard of it. Let’s go!",
    "CityMart Services are a go! 🚀",
    "Apologies for the brief AFK, just didn't feel like it.",
    "And we're back! Time to get shopping!",
    "Went to CityBean, but couldn't miss out any longer. Ping me whenever!",
    "Oh, thought the lamp caught me for a second there! But I've used /e dance and I'm back."
  ];
  const randomMessage = comebackLines[Math.floor(Math.random() * comebackLines.length)];

  try {
    if (GENERAL_CHANNEL_ID) {
      const channel = await client.channels.fetch(GENERAL_CHANNEL_ID);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#38a34a')
          .setTitle(randomMessage)
          .setDescription('Your friendly CityMart Services bot is back online after an update or restart.')
          .setThumbnail(THUMBNAIL_URL)
          .setFooter({
            text: `Uptime started: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Brussels' })}`
          })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    console.error('⚠️ Could not send comeback message:', err);
  }

  // Kick off Roblox tracker
  if (ROBLOX_GROUP_ID && COMMANDS_CHANNEL_ID) {
    // initial sync (no toast) + 15 min interval
    pollRobloxMembers();
    setInterval(pollRobloxMembers, 15 * 60 * 1000);
  }
});

// ---------------------- Mention-based keywords ----------------------
client.on('messageCreate', async message => {
  try {
    if (message.author.bot || !message.guild) return;

    // Generic cooldown
    const now  = Date.now();
    const last = userCooldowns.get(message.author.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    userCooldowns.set(message.author.id, now);

    const msg = message.content.toLowerCase();

    // React with emoji (lamp gets lamp emoji)
    for (const word of REACTION_KEYWORDS) {
      if (msg.includes(word)) {
        const emojiToUse = word === 'lamp' ? LAMP_EMOJI : CITYMART_EMOJI;
        try { await message.react(emojiToUse); } catch {}
        break;
      }
    }

    // Lamp embed fires anytime (no mention required)
    if (LAMP_TRIGGER && LAMP_TRIGGER.regex.test(msg)) {
      return message.channel.send({
        content: `${message.author}`,
        embeds: [LAMP_TRIGGER.embed]
      });
    }

    // ---- memberlookup as mention-keyword: "@bot memberlookup SomeUser" ----
    if (message.mentions.has(client.user)) {
      const mlMatch = message.content.match(/\bmemberlookup\s+([A-Za-z0-9_]{3,20})/i);
      if (mlMatch) {
        const username = mlMatch[1];
        try {
          const userId = await robloxUsernameToId(username);
          if (!userId) {
            return message.reply(`Couldn't find a Roblox user named **${username}**.`);
          }
          const [info, avatarUrl, role] = await Promise.all([
            robloxUserInfo(userId),
            robloxAvatarThumb(userId),
            ROBLOX_GROUP_ID ? robloxGroupRole(userId, ROBLOX_GROUP_ID) : Promise.resolve(null)
          ]);
          info.citymartRole = role;
          const { embed, components } = buildMemberLookupEmbed(info, avatarUrl);
          return message.channel.send({ content: `${message.author}`, embeds: [embed], components });
        } catch (e) {
          console.error('memberlookup error:', e);
          return message.reply('⚠️ Something went wrong fetching that user.');
        }
      }
    }

    // Other keywords require mention
    if (!message.mentions.has(client.user)) return;

    // Ping (mention-based)
    if (/\bping\b/i.test(msg)) {
      const latency = Date.now() - message.createdTimestamp;
      const pingEmbed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setThumbnail(THUMBNAIL_URL)
        .setDescription(`Latency is **${latency}ms**\n\n🔗 [Bot Dashboard](${BOT_URL})`)
        .setColor(0x00FFAA)
        .setFooter({ text: 'CityMart Services' })
        .setTimestamp();
      return message.channel.send({ content: `${message.author}`, embeds: [pingEmbed] });
    }

    // Community count (mention-based keyword) — accepts "members" OR "communitycount"
    if (/\b(members?|communitycount)\b/i.test(msg)) {
      if (!allowMembersCheck(message.author.id)) {
        return message.reply('⏳ Please wait a bit before checking member counts again.');
      }
      if (!ROBLOX_GROUP_ID) {
        return message.reply('⚠️ ROBLOX_GROUP_ID not configured.');
      }
      try {
        const count = await fetchRobloxMemberCount(ROBLOX_GROUP_ID);
        const embed = new EmbedBuilder()
          .setColor('#38a34a')
          .setTitle('Roblox Community Members')
          .setDescription(`Current member count: **${count.toLocaleString()}**`)
          .setURL(COMMUNITY_URL)
          .setThumbnail(THUMBNAIL_URL)
          .setTimestamp();
        return message.channel.send({
          content: `${message.author}`,
          embeds: [embed],
          components: [createLinkRow(COMMUNITY_URL, 'Open Roblox Community')]
        });
      } catch (e) {
        return message.reply('❌ Could not fetch the member count right now. Try again later.');
      }
    }

    // Other trigger keywords
    for (const trigger of TRIGGERS) {
      if (trigger.keyword === 'lamp') continue;
      if (trigger.regex.test(msg)) {
        let components = [];
        if (trigger.keyword === 'support') {
          components = [createSupportRow()];
        } else if (trigger.url && trigger.buttonLabel) {
          components = [createLinkRow(trigger.url, trigger.buttonLabel)];
        }
        return message.channel.send({
          content: `${message.author}`,
          embeds: [trigger.embed],
          components
        });
      }
    }

    // Fallback: help embed
    await message.channel.send({ content: `${message.author}`, embeds: [HELP_EMBED] });
  } catch (err) {
    console.error('Error in messageCreate:', err);
  }
});

// ---------------------- Slash commands ----------------------
client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, createdTimestamp, user, guildId, channelId } = interaction;

    // Generic per-user cooldown
    const now  = Date.now();
    const last = userCooldowns.get(user.id) || 0;
    if (now - last < COOLDOWN_MS) {
      return interaction.reply({ content: '⏳ Please wait a few seconds before using another command.', ephemeral: true });
    }
    userCooldowns.set(user.id, now);

    switch (commandName) {
      case 'keywords':
        return interaction.reply({ embeds: [HELP_EMBED], ephemeral: false });

      case 'community':
      case 'experience':
      case 'application':
      case 'documentation':
      case 'support':
      case 'lorebook':
      case 'lamp': {
        const trigger = TRIGGERS.find(t => t.keyword === commandName);
        const opts = {
          content: `${user}`,
          embeds: [trigger.embed],
          ephemeral: false
        };
        if (commandName === 'support') {
          opts.components = [createSupportRow()];
        } else if (trigger?.url && trigger?.buttonLabel) {
          opts.components = [createLinkRow(trigger.url, trigger.buttonLabel)];
        }
        return interaction.reply(opts);
      }

      case 'ping': {
        const latency = Date.now() - createdTimestamp;
        const pingEmbed = new EmbedBuilder()
          .setTitle('🏓 Pong!')
          .setThumbnail(THUMBNAIL_URL)
          .setDescription(`Latency is **${latency}ms**\n\n🔗 [Bot Dashboard](${BOT_URL})`)
          .setColor(0x00FFAA)
          .setFooter({ text: 'CityMart Services' })
          .setTimestamp();
        return interaction.reply({ embeds: [pingEmbed], ephemeral: false });
      }

      // renamed from /members → /communitycount
      case 'communitycount': {
        if (!allowMembersCheck(user.id)) {
          return interaction.reply({ content: '⏳ Please wait a bit before checking member counts again.', ephemeral: true });
        }
        if (!ROBLOX_GROUP_ID) {
          return interaction.reply({ content: '⚠️ ROBLOX_GROUP_ID not configured.', ephemeral: true });
        }
        await interaction.deferReply();
        try {
          const count = await fetchRobloxMemberCount(ROBLOX_GROUP_ID);
          const embed = new EmbedBuilder()
            .setColor('#38a34a')
            .setTitle('Roblox Community Members')
            .setDescription(`Current member count: **${count.toLocaleString()}**`)
            .setURL(COMMUNITY_URL)
            .setThumbnail(THUMBNAIL_URL)
            .setFooter({ text: 'CityMart Services' })
            .setTimestamp();
          return interaction.editReply({
            embeds: [embed],
            components: [createLinkRow(COMMUNITY_URL, 'Open Roblox Community')]
          });
        } catch (e) {
          return interaction.editReply('❌ Could not fetch the member count right now. Try again later.');
        }
      }

      case 'giveaway': {
        if (!interaction.guild) {
          return interaction.reply({
            content: 'This command can only be used inside a server.',
            ephemeral: true
          });
        }

        const sub = interaction.options.getSubcommand();

        // Owner-only for management subcommands, but NOT for "entries"
        if (sub !== 'entries' && interaction.guild.ownerId !== user.id) {
          return interaction.reply({
            content: 'Only the server owner can start, end or reroll giveaways.',
            ephemeral: true
          });
        }

        if (sub === 'start') {
          const prize = interaction.options.getString('prize', true);
          const endInput = interaction.options.getString('end', true);

          const endAt = parseGiveawayEnd(endInput);
          if (!endAt || endAt <= Date.now()) {
            return interaction.reply({
              content: 'Invalid end time. Use format `YYYY-MM-DD HH:mm` and make sure it is in the future.',
              ephemeral: true
            });
          }

          const endTs = Math.floor(endAt / 1000); // Unix seconds

          const embed = new EmbedBuilder()
            .setTitle('🎁 CityMart Giveaway')
            .setColor(0xffc107)
            .setThumbnail(THUMBNAIL_URL)
            .setDescription(
              [
                `Prize: **${prize}**`,
                '',
                'Click the button below to enter!',
                '',
                `Ends: <t:${endTs}:F> (<t:${endTs}:R>)`
              ].join('\n')
            )
            .setFooter({ text: `Hosted by ${interaction.user.tag}` })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('giveaway_enter')
              .setLabel('Enter Giveaway')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('giveaway_entries')
              .setLabel('Entrants')
              .setStyle(ButtonStyle.Secondary)
);

          const msg = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
          });

          giveaways.set(msg.id, {
            messageId: msg.id,
            channelId: msg.channel.id,
            guildId: msg.guildId,
            prize,
            endAt,
            createdBy: interaction.user.id,
            entrants: [],
            ended: false,
            winnerId: null
          });
          saveGiveawaysToDisk();
          break;
        }

        if (sub === 'end') {
          const messageId = interaction.options.getString('message_id', true);
          const g = giveaways.get(messageId);
          if (!g) {
            return interaction.reply({
              content: 'Could not find that giveaway. Make sure the message ID is correct.',
              ephemeral: true
            });
          }
          if (g.ended) {
            return interaction.reply({
              content: 'That giveaway has already ended.',
              ephemeral: true
            });
          }
          await interaction.reply({ content: 'Ending giveaway...', ephemeral: true });
          await endGiveaway(messageId, g, { reroll: false });
          g.ended = true;
          break;
        }

        if (sub === 'reroll') {
          const messageId = interaction.options.getString('message_id', true);
          const g = giveaways.get(messageId);
          if (!g) {
            return interaction.reply({
              content: 'Could not find that giveaway. Make sure the message ID is correct.',
              ephemeral: true
            });
          }
          if (!g.ended) {
            return interaction.reply({
              content: 'You can only reroll a giveaway that has already ended.',
              ephemeral: true
            });
          }
          if (!g.entrants || g.entrants.length === 0) {
            return interaction.reply({
              content: 'There are no entrants to reroll from.',
              ephemeral: true
            });
          }

          await interaction.reply({ content: 'Rerolling giveaway winner...', ephemeral: true });
          await endGiveaway(messageId, g, { reroll: true });
          break;
        }

        if (sub === 'entries') {
          const messageId = interaction.options.getString('message_id', true);
          const g = giveaways.get(messageId);
          if (!g) {
            return interaction.reply({
              content: 'Could not find that giveaway. Make sure the message ID is correct.',
              ephemeral: true
            });
          }

          const entrants = g.entrants || [];
          if (entrants.length === 0) {
            return interaction.reply({
              content: 'No one has entered this giveaway yet.',
              ephemeral: true
            });
          }

          // Show up to 25 entrants in a single message
          const maxToShow = 25;
          const slice = entrants.slice(0, maxToShow);

          const lines = slice.map((userId, idx) => {
            return `**#${idx + 1}** — <@${userId}>`;
          });

          if (entrants.length > maxToShow) {
            lines.push(`…and **${entrants.length - maxToShow}** more entrants.`);
          }

          const embed = new EmbedBuilder()
            .setTitle('🎁 Giveaway Entries')
            .setColor(0x00ffaa)
            .setDescription(lines.join('\n'))
            .setFooter({
              text: `Giveaway message ID: ${messageId} • Total entrants: ${entrants.length}`
            })
            .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: false });
        }

        break;
      }

      // hallAI bridge
      case 'ask': {
        const prompt = interaction.options.getString('prompt', true);

        // /ask burst limit per conversation
        const key = askKey(guildId, channelId, user.id);
        if (!allowAsk(key)) {
          return interaction.reply({
            content: '🚦 Rate limit: max 5 questions per minute for this conversation. Please try again in a bit.',
            ephemeral: true
          });
        }

        await interaction.deferReply(); // show "thinking…"

        // Build conversation context
        const history = getHistory(key);
        const messages = [
          { role: 'system', content: "You are hallAI, a retro terminal AI assistant built by Dave Van Cauwenberghe and launched on Thursday, 7 August 2025. Be helpful, nerdy, concise with a touch of sensitivity and witty humor. Use markdown where useful. You're running on gpt-4.1-nano" },
          ...history,
          { role: 'user', content: prompt }
        ];

        try {
          const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,           // for backward compatibility
              identifier: key,  // worker can use this if desired
              messages          // optional; worker can ignore
            })
          });

          if (!res.ok) throw new Error(`Worker returned ${res.status}`);
          const text = await res.text();

          // Save this turn locally
          pushTurn(key, prompt, text);

          // Discord 2k char safety
          const reply = text.length > 2000 ? text.slice(0, 1990) + '…' : text;
          return interaction.editReply(reply);
        } catch (err) {
          console.error('ask → hallAI error:', err);
          return interaction.editReply('❌ Sorry, I couldn’t reach hallAI. Try again later.');
        }
      }

      // /memberlookup
      case 'memberlookup': {
        const username = interaction.options.getString('username', true);
        await interaction.deferReply();
        try {
          const userId = await robloxUsernameToId(username);
          if (!userId) {
            return interaction.editReply(`Couldn't find a Roblox user named **${username}**.`);
          }
          const [info, avatarUrl, role] = await Promise.all([
            robloxUserInfo(userId),
            robloxAvatarThumb(userId),
            ROBLOX_GROUP_ID ? robloxGroupRole(userId, ROBLOX_GROUP_ID) : Promise.resolve(null)
          ]);
          info.citymartRole = role;
          const { embed, components } = buildMemberLookupEmbed(info, avatarUrl);
          return interaction.editReply({ embeds: [embed], components });
        } catch (e) {
          console.error('memberlookup error:', e);
          return interaction.editReply('⚠️ Something went wrong fetching that user.');
        }
      }
    }
  } catch (err) {
    console.error('Error in interactionCreate:', err);
    if (interaction && !interaction.replied) {
      interaction.reply({ content: '⚠️ An internal error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

// ---------------------- Button Interactions (Giveaways) ----------------------
client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'giveaway_enter') {
      await handleGiveawayEnterButton(interaction);
      return;
    }

    if (interaction.customId === 'giveaway_entries') {
      const msg = interaction.message;
      if (!msg || !msg.id) {
        return interaction.reply({
          content: 'This giveaway is no longer valid.',
          ephemeral: true
        });
      }

      const g = giveaways.get(msg.id);
      if (!g) {
        return interaction.reply({
          content: 'Could not find this giveaway. It may no longer be active.',
          ephemeral: true
        });
      }

      const entrants = g.entrants || [];
      if (entrants.length === 0) {
        return interaction.reply({
          content: 'No one has entered this giveaway yet.',
          ephemeral: true
        });
      }

      const maxToShow = 25;
      const slice = entrants.slice(0, maxToShow);

      const lines = slice.map((userId, idx) => `**#${idx + 1}** — <@${userId}>`);
      if (entrants.length > maxToShow) {
        lines.push(`…and **${entrants.length - maxToShow}** more entrants.`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🎁 Giveaway Entrants')
        .setColor(0x00ffaa)
        .setDescription(lines.join('\n'))
        .setFooter({
          text: `Giveaway message ID: ${msg.id} • Total entrants: ${entrants.length}`
        })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true // change to false if you want it public
      });
    }

  } catch (err) {
    console.error('Button interaction error:', err);
  }
});

client.login(DISCORD_TOKEN);

// ---------------------- Tiny landing page server ----------------------
const PORT = process.env.PORT || 8080;
http
  .createServer((req, res) => {
    const filePath = path.join(__dirname, 'public', 'index.html');
    fs.readFile(filePath, (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Error loading page');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(html);
    });
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });
