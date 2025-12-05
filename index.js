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

// ---------------------- Cooldowns & Rate Limits ----------------------
const userCooldowns = new Map();
const COOLDOWN_MS   = 5000;

const ASK_WINDOW_MS = 60_000;
const ASK_MAX       = 5;
const askBuckets    = new Map();

const MEMBERS_WINDOW_MS = 30_000;
const membersBuckets = new Map();

const MAX_TURNS = 8;
const askHistory  = new Map();
function askKey(gid, cid, uid) {
return `${gid}:${cid}:${uid}`;
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
function pushTurn(key, u, a) {
const prev = getHistory(key);
const next = [...prev, { role: 'user', content: u }, { role: 'assistant', content: a }];
askHistory.set(key, next.slice(-MAX_TURNS * 2));
}
function allowMembersCheck(uid) {
const last = membersBuckets.get(uid) || 0;
const now = Date.now();
if (now - last < MEMBERS_WINDOW_MS) return false;
membersBuckets.set(uid, now);
return true;
}

setInterval(() => {
const cutoff = Date.now() - 60 * 60 * 1000;
for (const [uid, ts] of userCooldowns) if (ts < cutoff) userCooldowns.delete(uid);
for (const [key, arr] of askBuckets) {
const pruned = arr.filter(t => Date.now() - t < ASK_WINDOW_MS);
if (pruned.length) askBuckets.set(key, pruned);
else askBuckets.delete(key);
}
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
USER_AGENT
} = process.env;

const OUTBOUND_UA = USER_AGENT || 'CityMartServicesBot/1.1';

// ---------------------- Discord Client ----------------------
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

// ---------------------- Constants ----------------------
const THUMBNAIL_URL = '[https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png](https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png)';

// Raw emojis fallback
const CITYMART_EMOJI_RAW = '<:citymart:1400628955253575711>';
const LAMP_EMOJI_RAW     = '<:lamp:1402100477134508222>';
const CITYMART_EMOJI     = /^<a?:\w+:\d+>$/.test(CITYMART_EMOJI_RAW) ? CITYMART_EMOJI_RAW : '🛒';
const LAMP_EMOJI         = /^<a?:\w+:\d+>$/.test(LAMP_EMOJI_RAW)    ? LAMP_EMOJI_RAW    : '💡';

const REACTION_KEYWORDS = ['shopping','mart','cart','shop','store','lamp','citymart'];

const escapeForRegex = require('./utils/escapeForRegex');

// ---------------------- Cache (5m TTL) ----------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const cacheGet = key => {
const hit = cache.get(key);
if (!hit) return null;
if (hit.expires < Date.now()) { cache.delete(key); return null; }
return hit.value;
};
const cacheSet = (k, v, ttl=CACHE_TTL_MS) => {
cache.set(k, { value:v, expires: Date.now()+ttl });
};

// ---------------------- Roblox helpers ----------------------
async function robloxUsernameToId(username) {
const key = `uname:${username.toLowerCase()}`;
const cached = cacheGet(key);
if (cached !== null) return cached;

const res = await fetch('[https://users.roblox.com/v1/usernames/users](https://users.roblox.com/v1/usernames/users)', {
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
if (!res.ok) { cacheSet(key,null); return null; }
const data = await res.json();
const imageUrl = data?.data?.[0]?.imageUrl ?? null;
cacheSet(key, imageUrl);
return imageUrl;
}

// ⭐ CITYMART ROLE LOOKUP ADDED
async function robloxGroupRole(userId, groupId) {
const key = `role:${userId}:${groupId}`;
const cached = cacheGet(key);
if (cached !== null) return cached;

const url = `https://groups.roblox.com/v1/users/${userId}/groups/roles`;
const res = await fetch(url, { headers: { 'User-Agent': OUTBOUND_UA }});
if (!res.ok) { cacheSet(key,null); return null; }
const data = await res.json();
const groupInfo = data.data.find(g => String(g.group.id) === String(groupId));
const role = groupInfo?.role || null;
cacheSet(key, role);
return role;
}

function buildMemberLookupEmbed(info, avatarUrl) {
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
{ name: 'Joined', value: joined.toLocaleString('en-GB', { timeZone:'Europe/Brussels' }), inline: true }
)
.setTimestamp();

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

const desc = info.description?.trim();
if (desc) embed.addFields({ name:'Bio', value: desc.length>1024?desc.slice(0,1015)+'…':desc });

const components = [
new ActionRowBuilder().addComponents(
new ButtonBuilder().setLabel('Open Profile').setStyle(ButtonStyle.Link).setURL(profileUrl)
)
];
return { embed, components };
}

// ---------------------- Triggers, HELP_EMBED, Support Rows etc. ----------------------
const TRIGGERS = [
{
keyword: 'community',
regex: new RegExp(`\\b${escapeForRegex('community')}\\b`, 'i'),
url: '[https://www.roblox.com/communities/36060455/CityMart-Group#!/about](https://www.roblox.com/communities/36060455/CityMart-Group#!/about)',
buttonLabel: 'Open Roblox Community',
embed: new EmbedBuilder()
.setTitle('CityMart Community')
.setThumbnail(THUMBNAIL_URL)
.setDescription('Hey there! 👋 Join our Roblox Community to chat with fellow CityMart shoppers!')
.setURL('[https://www.roblox.com/communities/36060455/CityMart-Group#!/about](https://www.roblox.com/communities/36060455/CityMart-Group#!/about)')
.setTimestamp()
},
{
keyword: 'experience',
regex: new RegExp(`\\b${escapeForRegex('experience')}\\b`, 'i'),
url: '[https://www.roblox.com/games/84931510725955/CityMart-Shopping](https://www.roblox.com/games/84931510725955/CityMart-Shopping)',
buttonLabel: 'Open Experience',
embed: new EmbedBuilder()
.setTitle('CityMart Shopping Experience')
.setThumbnail(THUMBNAIL_URL)
.setDescription('Visit our virtual CityMart store on Roblox!')
.setURL('[https://www.roblox.com/games/84931510725955/CityMart-Shopping](https://www.roblox.com/games/84931510725955/CityMart-Shopping)')
.setTimestamp()
},
{
keyword: 'application',
regex: new RegExp(`\\b${escapeForRegex('application')}\\b`, 'i'),
url: '[https://www.roblox.com/games/138757153564625/CityMart-Application-Centre](https://www.roblox.com/games/138757153564625/CityMart-Application-Centre)',
buttonLabel: 'Open Application Centre',
embed: new EmbedBuilder()
.setTitle('CityMart Application Centre')
.setThumbnail(THUMBNAIL_URL)
.setDescription('Apply to work with the CityMart Group!')
.setURL('[https://www.roblox.com/games/138757153564625/CityMart-Application-Centre](https://www.roblox.com/games/138757153564625/CityMart-Application-Centre)')
.setTimestamp()
},
{
keyword: 'support',
regex: new RegExp(`\\b${escapeForRegex('support')}\\b`, 'i'),
embed: new EmbedBuilder()
.setTitle('Need Help?')
.setThumbnail(THUMBNAIL_URL)
.setDescription('Click below to jump to our support channel!')
.setColor(0xff9900)
.setTimestamp()
},
{
keyword: 'documentation',
regex: new RegExp(`\\b${escapeForRegex('documentation')}\\b`, 'i'),
url: '[https://citymartgroup.gitbook.io/docs/](https://citymartgroup.gitbook.io/docs/)',
buttonLabel: 'Open Documentation',
embed: new EmbedBuilder()
.setTitle('CityMart Documentation')
.setThumbnail(THUMBNAIL_URL)
.setDescription('Browse our official docs.')
.setURL('[https://citymartgroup.gitbook.io/docs/](https://citymartgroup.gitbook.io/docs/)')
.setTimestamp()
},
{
keyword: 'lorebook',
regex: new RegExp(`\\b${escapeForRegex('lorebook')}\\b`, 'i'),
url: '[https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2](https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2)',
buttonLabel: 'Open Lorebook',
embed: new EmbedBuilder()
.setTitle('CityMart Lore Book')
.setThumbnail(THUMBNAIL_URL)
.setColor(0x00AEFF)
.setDescription('Dive deeper into the CityMart universe!')
.setTimestamp()
},
{
keyword: 'lamp',
regex: new RegExp(`\\b${escapeForRegex('lamp')}\\b`, 'i'),
embed: new EmbedBuilder()
.setTitle('About the Lamp')
.setColor(0xFFD700)
.setDescription("💡 We don't talk about the lamp...")
.setImage('[https://storage.davevancauwenberghe.be/citymart/visuals/lamp.png](https://storage.davevancauwenberghe.be/citymart/visuals/lamp.png)')
.setTimestamp()
}
];

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
.setFooter({ text: 'Need help? Ping or use /keywords' })
.setTimestamp();

function createSupportRow() {
return new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setLabel('Go to Support')
.setEmoji('❓')
.setStyle(ButtonStyle.Link)
.setURL(`https://discord.com/channels/${GUILD_ID}/${SUPPORT_CHANNEL_ID}`)
);
}
function createLinkRow(url,label) {
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)
);
}

// ---------------------- Roblox Member Count Tracker ----------------------
let lastMemberCount = null;
const COMMUNITY_URL = '[https://www.roblox.com/communities/36060455/CityMart-Group#!/about](https://www.roblox.com/communities/36060455/CityMart-Group#!/about)';

async function fetchRobloxMemberCount(groupId) {
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 10000);
try {
const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
signal: ctrl.signal,
headers: { 'User-Agent': OUTBOUND_UA }
});
clearTimeout(t);
if (!res.ok) throw new Error(`Roblox HTTP ${res.status}`);
const data = await res.json();
return Number(data?.memberCount);
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
lastMemberCount = current;
return;
}
if (current !== lastMemberCount) {
const diff = current - lastMemberCount;
lastMemberCount = current;
const channel = await client.channels.fetch(COMMANDS_CHANNEL_ID).catch(()=>null);
if (!channel?.isTextBased()) return;

```
  const growing = diff > 0;
  const abs = Math.abs(diff);
  const title = growing
    ? `\u{1F389} ${abs} new shopper${abs===1?'':'s'} joined!`
    : `👋 ${abs} shopper${abs===1?'':'s'} left!`;

  const color = growing ? 0x38a34a : 0xd9534f;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`Current: **${current.toLocaleString()}**`)
    .setURL(COMMUNITY_URL)
    .setThumbnail(THUMBNAIL_URL)
    .setTimestamp();

  await channel.send({ embeds:[embed], components:[createLinkRow(COMMUNITY_URL,'Open Roblox Community')] });
}
```

} catch (err) {
console.error('Roblox tracker error:', err?.message||err);
}
}

// ---------------------- Lifecycle ----------------------
client.once('ready', async () => {
console.log(`✅ Logged in as ${client.user.tag}`);
client.user.setPresence({
activities: [{ name:'CityMart Shoppers 🛒', type: ActivityType.Watching }],
status: 'online'
});

// ⭐ PRESENCE REFRESH ADDED
setInterval(() => {
const txt = lastMemberCount
? `${lastMemberCount.toLocaleString()} Shoppers`
: 'CityMart Shoppers 🛒';
client.user.setPresence({
activities: [{ name: txt, type: ActivityType.Watching }],
status: 'online'
});
}, 10 * 60 * 1000);

pollRobloxMembers();
setInterval(pollRobloxMembers, 15 * 60 * 1000);
});

// ---------------------- Mention-based keywords ----------------------
client.on('messageCreate', async message => {
try {
if (message.author.bot || !message.guild) return;

```
// cooldown
const now = Date.now();
const last = userCooldowns.get(message.author.id) || 0;
if (now - last < COOLDOWN_MS) return;
userCooldowns.set(message.author.id, now);

const msg = message.content.toLowerCase();

// Reaction emojis
for (const w of REACTION_KEYWORDS) {
  if (msg.includes(w)) {
    try { await message.react(w==='lamp'?LAMP_EMOJI:CITYMART_EMOJI); } catch {}
    break;
  }
}

// Lamp always triggers
const lampTrigger = TRIGGERS.find(t=>t.keyword==='lamp');
if (lampTrigger?.regex.test(msg)) {
  return message.channel.send({ content:`${message.author}`, embeds:[lampTrigger.embed] });
}

// Mention — memberlookup
if (message.mentions.has(client.user)) {
  const mlMatch = message.content.match(/\bmemberlookup\s+([A-Za-z0-9_]{3,20})/i);
  if (mlMatch) {
    const username = mlMatch[1];
    try {
      const userId = await robloxUsernameToId(username);
      if (!userId) return message.reply(`Couldn't find a Roblox user named **${username}**.`);
      const [info, avatarUrl, role] = await Promise.all([
        robloxUserInfo(userId),
        robloxAvatarThumb(userId),
        ROBLOX_GROUP_ID ? robloxGroupRole(userId, ROBLOX_GROUP_ID) : Promise.resolve(null)
      ]);
      info.citymartRole = role;
      const { embed, components } = buildMemberLookupEmbed(info, avatarUrl);
      return message.channel.send({ content:`${message.author}`, embeds:[embed], components });
    } catch (e) {
      console.error('memberlookup (mention) error:', e);
      return message.reply('⚠️ Something went wrong fetching that user.');
    }
  }
}

// Require mention for all others
if (!message.mentions.has(client.user)) return;

// Ping
if (/\bping\b/i.test(msg)) {
  const latency = Date.now() - message.createdTimestamp;
  const pingEmbed = new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .setThumbnail(THUMBNAIL_URL)
    .setDescription(`Latency: **${latency}ms**\n\n🔗 [Bot Dashboard](${BOT_URL})`)
    .setColor(0x00FFAA)
    .setTimestamp();
  return message.channel.send({ content:`${message.author}`, embeds:[pingEmbed] });
}

// Member count mention
if (/\b(members?|communitycount)\b/i.test(msg)) {
  if (!allowMembersCheck(message.author.id)) {
    return message.reply('⏳ Please wait before checking again.');
  }
  if (!ROBLOX_GROUP_ID) return message.reply('⚠️ ROBLOX_GROUP_ID missing.');
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
      content:`${message.author}`,
      embeds:[embed],
      components: [createLinkRow(COMMUNITY_URL,'Open Roblox Community')]
    });
  } catch {
    return message.reply('❌ Could not fetch member count right now!');
  }
}

// Other keyword triggers
for (const t of TRIGGERS) {
  if (t.keyword==='lamp') continue;
  if (t.regex.test(msg)) {
    let components = [];
    if (t.keyword==='support') components=[createSupportRow()];
    else if (t.url && t.buttonLabel) components=[createLinkRow(t.url,t.buttonLabel)];
    return message.channel.send({ content:`${message.author}`, embeds:[t.embed], components });
  }
}

// Fallback help
message.channel.send({ content:`${message.author}`, embeds:[HELP_EMBED] });
```

} catch (err) {
console.error('Error in messageCreate:', err);
}
});

// ---------------------- Slash commands ----------------------
client.on('interactionCreate', async interaction => {
try {
if (!interaction.isChatInputCommand()) return;
const { commandName, createdTimestamp, user, guildId, channelId } = interaction;

```
// cooldown
const now = Date.now();
const last = userCooldowns.get(user.id) || 0;
if (now - last < COOLDOWN_MS) {
  return interaction.reply({
    content:'⏳ Please wait a few seconds.',
    ephemeral: true // ⭐ EPHEMERAL FIX
  });
}
userCooldowns.set(user.id, now);

switch (commandName) {
  case 'keywords':
    return interaction.reply({ embeds:[HELP_EMBED], ephemeral:false });

  case 'community':
  case 'experience':
  case 'application':
  case 'documentation':
  case 'support':
  case 'lorebook':
  case 'lamp': {
    const t = TRIGGERS.find(tr=>tr.keyword===commandName);
    const opts = {
      content:`${user}`,
      embeds:[t.embed],
      ephemeral:false
    };
    if (commandName==='support') opts.components=[createSupportRow()];
    else if (t.url && t.buttonLabel) opts.components=[createLinkRow(t.url,t.buttonLabel)];
    return interaction.reply(opts);
  }

  case 'ping': {
    const latency = Date.now() - createdTimestamp;
    const pingEmbed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription(`Latency: **${latency}ms**\n\n🔗 [Bot Dashboard](${BOT_URL})`)
      .setColor(0x00FFAA)
      .setTimestamp();
    return interaction.reply({ embeds:[pingEmbed], ephemeral:false });
  }

  case 'communitycount': {
    if (!allowMembersCheck(user.id)) {
      return interaction.reply({
        content:'⏳ Please wait a bit.',
        ephemeral:true
      });
    }
    if (!ROBLOX_GROUP_ID) {
      return interaction.reply({
        content:'⚠️ ROBLOX_GROUP_ID missing.',
        ephemeral:true
      });
    }
    await interaction.deferReply();
    try {
      const count = await fetchRobloxMemberCount(ROBLOX_GROUP_ID);
      const embed = new EmbedBuilder()
        .setColor('#38a34a')
        .setTitle('Roblox Community Members')
        .setDescription(`Current: **${count.toLocaleString()}**`)
        .setURL(COMMUNITY_URL)
        .setThumbnail(THUMBNAIL_URL)
        .setTimestamp();
      return interaction.editReply({
        embeds:[embed],
        components:[createLinkRow(COMMUNITY_URL,'Open Roblox Community')]
      });
    } catch {
      return interaction.editReply('❌ Could not fetch the member count.');
    }
  }

```
  case 'ask': {
    const prompt = interaction.options.getString('prompt', true);
    const key = askKey(guildId, channelId, user.id);

    if (!allowAsk(key)) {
      return interaction.reply({
        content:'🚦 Rate limit: max 5 per min. Try again soon.',
        ephemeral:true // ⭐ EPHEMERAL FIX
      });
    }

    await interaction.deferReply();

    const history = getHistory(key);
    const messages = [
      { role:'system', content: "You are hallAI, a retro terminal AI assistant built by Dave Van Cauwenberghe. Be helpful, nerdy and concise with witty humor. Markdown allowed." },
      ...history,
      { role:'user', content: prompt }
    ];

    try {
      const res = await fetch(WORKER_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          prompt,
          identifier: key,
          messages
        })
      });
      if (!res.ok) throw new Error(`Worker status ${res.status}`);
      const text = await res.text();

      pushTurn(key, prompt, text);

      const safe = text.length>2000 ? text.slice(0,1990)+'…' : text;
      return interaction.editReply(safe);
    } catch (err) {
      console.error('ask→hallAI error:', err);
      return interaction.editReply('❌ Could not reach hallAI. Try later!');
    }
  }

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
      return interaction.editReply({ embeds:[embed], components });
    } catch (e) {
      console.error('memberlookup error:', e);
      return interaction.editReply('⚠️ Something went wrong fetching that user.');
    }
  }
}
```

} catch (err) {
console.error('interactionCreate error:', err);
if (!interaction.replied) {
interaction.reply({
content:'⚠️ An internal error occurred.',
ephemeral:true // ⭐ EPHEMERAL FIX
}).catch(()=>{});
}
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
res.writeHead(500, { 'Content-Type':'text/plain' });
return res.end('Error loading page');
}
res.writeHead(200, { 'Content-Type':'text/html; charset=UTF-8' });
res.end(html);
});
})
.listen(PORT, '0.0.0.0', () => {
console.log(`🌐 HTTP server active on port ${PORT}`);
});
