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
const COOLDOWN_MS   = 5000; // generic per-user cooldown for mentions/slash

// /ask-specific burst limit: 5 reqs / 60s per (guild:channel:user)
const ASK_WINDOW_MS = 60_000;
const ASK_MAX       = 5;
const askBuckets    = new Map(); // key -> [timestamps]

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

// Periodic cleanup of stale maps (memory hygiene)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1h
  for (const [uid, ts] of userCooldowns) if (ts < cutoff) userCooldowns.delete(uid);

  for (const [key, stamps] of askBuckets) {
    const pruned = stamps.filter(t => Date.now() - t < ASK_WINDOW_MS);
    if (pruned.length) askBuckets.set(key, pruned);
    else askBuckets.delete(key);
  }
  // (askHistory left as-is so context persists while bot runs)
}, 30 * 60 * 1000);

// ---------------------- Environment ----------------------
const GUILD_ID   = process.env.GUILD_ID;
const WORKER_URL = process.env.WORKER_URL; // hallAI Worker URL
if (!process.env.DISCORD_TOKEN) console.warn('⚠️ DISCORD_TOKEN is not set; bot login will fail.');
if (!GUILD_ID)                   console.warn('⚠️ GUILD_ID is not set; some links (like support) may be invalid.');
if (!WORKER_URL)                 console.warn('⚠️ WORKER_URL is not set; /ask will fail.');

// ---------------------- Discord Client ----------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------------- Constants ----------------------
const SUPPORT_CHANNEL_ID = '1385699550005694586';
const GENERAL_CHANNEL_ID = '1385065666637201462'; // for the "I'm back" message
const BOT_URL            = 'https://citymart-bot.fly.dev/';
const THUMBNAIL_URL      = 'https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png';

// Custom emojis
const CITYMART_EMOJI_RAW = '<:citymart:1400628955253575711>';
const LAMP_EMOJI_RAW     = '<:lamp:1402100477134508222>';
const CITYMART_EMOJI     = /^<a?:\w+:\d+>$/.test(CITYMART_EMOJI_RAW) ? CITYMART_EMOJI_RAW : '🛒';
const LAMP_EMOJI         = /^<a?:\w+:\d+>$/.test(LAMP_EMOJI_RAW)    ? LAMP_EMOJI_RAW    : '💡';

// Reaction keywords
const REACTION_KEYWORDS = ['shopping','mart','cart','shop','store','lamp'];

// Utility to escape regex special chars (from your utils)
const escapeForRegex = require('./utils/escapeForRegex');

// ---------------------- Triggers ----------------------
const TRIGGERS = [
  {
    keyword: 'community',
    regex: new RegExp(`\\b${escapeForRegex('community')}\\b`, 'i'),
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
    embed: new EmbedBuilder()
      .setTitle('CityMart Shopping Experience')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Ready for a shopping spree? 🛒 Visit our virtual CityMart store on Roblox and explore hundreds of items!')
      .setURL('https://www.roblox.com/games/84931510725955/CityMart-Shopping')
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
    keyword: 'lorebook',
    regex: new RegExp(`\\b${escapeForRegex('lorebook')}\\b`, 'i'),
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
    { name: '🔗 Roblox Links', value: 'community\nexperience',      inline: false },
    { name: '🆘 Support',      value: 'support',                     inline: false },
    { name: '📖 Misc',         value: 'lorebook\nlamp\nping\nask',   inline: false },
    { name: '🔗 Dashboard',    value: `[Bot Dashboard](${BOT_URL})`, inline: false }
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

// ---------------------- Lifecycle ----------------------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'CityMart Shoppers 🛒', type: ActivityType.Watching }],
    status: 'online'
  });

  // Fun randomized "I'm back!" message to #general
  const comebackLines = [
    "Beep boop, system reboot complete. I'm back online!",
    "Well, that was a nice nap. Ready to serve again! 🛒",
    "Guess who just reconnected? Hint: it’s me.",
    "Downtime? Never heard of her. Let’s go!",
    "CityMart Services are a go! 🚀",
    "Apologies for the brief AFK, just didn't feel like it.",
    "And we're back! Time to get shopping!"
  ];
  const randomMessage = comebackLines[Math.floor(Math.random() * comebackLines.length)];

  try {
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
  } catch (err) {
    console.error('⚠️ Could not send comeback message:', err);
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

    // Other triggers
    for (const trigger of TRIGGERS) {
      if (trigger.keyword === 'lamp') continue;
      if (trigger.regex.test(msg)) {
        const components = trigger.keyword === 'support' ? [createSupportRow()] : [];
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
      case 'support':
      case 'lorebook':
      case 'lamp': {
        const trigger = TRIGGERS.find(t => t.keyword === commandName);
        const opts = {
          content: `${user}`,
          embeds: [trigger.embed],
          ephemeral: false
        };
        if (commandName === 'support') opts.components = [createSupportRow()];
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
    }
  } catch (err) {
    console.error('Error in interactionCreate:', err);
    if (interaction && !interaction.replied) {
      interaction.reply({ content: '⚠️ An internal error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

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
