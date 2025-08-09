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

// Simple cooldown tracker
const userCooldowns = new Map();
const COOLDOWN_MS    = 5000;

// Environment sanity
const GUILD_ID   = process.env.GUILD_ID;
const WORKER_URL = process.env.WORKER_URL; // your hallAI Worker URL
if (!process.env.DISCORD_TOKEN) {
  console.warn('⚠️ DISCORD_TOKEN is not set; bot login will fail.');
}
if (!GUILD_ID) {
  console.warn('⚠️ GUILD_ID is not set; some links (like support) may be invalid.');
}
if (!WORKER_URL) {
  console.warn('⚠️ WORKER_URL is not set; /ask will fail.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Constants
const SUPPORT_CHANNEL_ID = '1385699550005694586';
const BOT_URL            = 'https://citymart-bot.fly.dev/';
const THUMBNAIL_URL      = 'https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png';

// Custom emojis
const CITYMART_EMOJI_RAW = '<:citymart:1400628955253575711>';
const LAMP_EMOJI_RAW     = '<:lamp:1402100477134508222>';
const CITYMART_EMOJI     = /^<a?:\w+:\d+>$/.test(CITYMART_EMOJI_RAW) ? CITYMART_EMOJI_RAW : '🛒';
const LAMP_EMOJI         = /^<a?:\w+:\d+>$/.test(LAMP_EMOJI_RAW)    ? LAMP_EMOJI_RAW    : '💡';

// Reaction keywords
const REACTION_KEYWORDS = ['shopping','mart','cart','shop','store','lamp'];

// Utility to escape regex special chars
const escapeForRegex = require('./utils/escapeForRegex');

// Build triggers with precompiled regex + embeds
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

// Help embed
const HELP_EMBED = new EmbedBuilder()
  .setTitle('CityMart Services Help')
  .setThumbnail(THUMBNAIL_URL)
  .setColor(0x00FFAA)
  .setDescription('Use @CityMart Services <keyword> or slash commands to interact.')
  .addFields(
    { name: '🔗 Roblox Links', value: 'community\nexperience',      inline: false },
    { name: '🆘 Support',        value: 'support',                   inline: false },
    { name: '📖 Misc',           value: 'lorebook\nlamp\nping\nask', inline: false },
    { name: '🔗 Dashboard',      value: `[Bot Dashboard](${BOT_URL})`, inline: false }
  )
  .setFooter({ text: 'Need help? Ping CityMart Services with a keyword or use /keywords' })
  .setTimestamp();

// Periodic cleanup of stale cooldown entries
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [uid, ts] of userCooldowns.entries()) {
    if (ts < cutoff) userCooldowns.delete(uid);
  }
}, 30 * 60 * 1000);

// Support button helper
function createSupportRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Go to Support')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${SUPPORT_CHANNEL_ID}`)
  );
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'CityMart Shoppers 🛒', type: ActivityType.Watching }],
    status: 'online'
  });
});

client.on('messageCreate', async message => {
  try {
    if (message.author.bot || !message.guild) return;

    // Cooldown
    const now  = Date.now();
    const last = userCooldowns.get(message.author.id) || 0;
    if (now - last < COOLDOWN_MS) return;
    userCooldowns.set(message.author.id, now);

    const msg = message.content.toLowerCase();

    // Reaction logic
    for (const word of REACTION_KEYWORDS) {
      if (msg.includes(word)) {
        const emojiToUse = word === 'lamp' ? LAMP_EMOJI : CITYMART_EMOJI;
        try { await message.react(emojiToUse); } catch {}
        break;
      }
    }

    // 1) Lamp embed fires anytime
    if (TRIGGERS[4].regex.test(msg)) {
      return message.channel.send({
        content: `${message.author}`,
        embeds: [TRIGGERS[4].embed]
      });
    }

    // 2) All others require a mention
    if (!message.mentions.has(client.user)) return;

    // 3) Ping mention-based
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

    // 4) Other keyword triggers
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

    // 5) Fallback: help embed
    await message.channel.send({
      content: `${message.author}`,
      embeds: [HELP_EMBED]
    });
  } catch (err) {
    console.error('Error in messageCreate:', err);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isCommand()) return;
    const { commandName, createdTimestamp, user } = interaction;

    // Cooldown
    const now  = Date.now();
    const last = userCooldowns.get(user.id) || 0;
    if (now - last < COOLDOWN_MS) {
      return interaction.reply({ content: '⏳ Please wait a few seconds before using another command.', ephemeral: true });
    }
    userCooldowns.set(user.id, now);

    // handle slash commands
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
      case 'ask': {
        const prompt = interaction.options.getString('prompt');
        await interaction.deferReply();
        try {
          const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
          });
          const text = await res.text();
          return interaction.editReply(text);
        } catch {
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

// ─── Simple HTTP server for landing page ───────────────────────────────
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
