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
const GUILD_ID      = process.env.GUILD_ID;
const WORKER_URL    = process.env.WORKER_URL;        // ← your hallAI Worker URL
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
function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build triggers with precompiled regex + embeds
const TRIGGERS = [
  /* community, experience, support, lorebook… identical to before */,
  {
    keyword: 'lamp',
    regex: new RegExp(`\\b${escapeForRegex('lamp')}\\b`, 'i'),
    embed: new EmbedBuilder()
      .setTitle('About the Lamp')
      .setColor(0xFFD700)
      .setDescription(
        "💡 We don't talk about the lamp. The lamp doesn't exist.\n\n" +
        'Ever since that malicious lamp script from the Roblox toolbox infiltrated CityMart, ' +
        'no one dares mention it again. Handle with caution!'
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
    { name: '🔗 Roblox Links', value: 'community\nexperience'      , inline: false },
    { name: '🆘 Support',        value: 'support'                   , inline: false },
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

    // Reaction logic: lamp uses lamp emoji else CityMart
    for (const word of REACTION_KEYWORDS) {
      if (msg.includes(word)) {
        const emojiToUse = word === 'lamp' ? LAMP_EMOJI : CITYMART_EMOJI;
        try { await message.react(emojiToUse); }
        catch { /* ignore */ }
        break;
      }
    }

    // Lamp embed regardless of mention
    if (TRIGGERS.find(t => t.keyword === 'lamp').regex.test(msg)) {
      return message.channel.send({
        content: `${message.author}`,
        embeds: [TRIGGERS.find(t => t.keyword === 'lamp').embed]
      });
    }

    // All others require mention
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

    // Other triggers (community, experience, support, lorebook)
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

    // Fallback help
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

    // /keywords
    if (commandName === 'keywords') {
      return interaction.reply({ embeds: [HELP_EMBED], ephemeral: false });
    }

    // community, experience, lorebook, lamp
    if (['community','experience','lorebook','lamp'].includes(commandName)) {
      const trigger = TRIGGERS.find(t => t.keyword === commandName);
      return interaction.reply({ content: `${user}`, embeds: [trigger.embed], ephemeral: false });
    }

    // /support
    if (commandName === 'support') {
      const supportEmbed = TRIGGERS.find(t => t.keyword === 'support').embed;
      return interaction.reply({ embeds: [supportEmbed], components: [createSupportRow()], ephemeral: false });
    }

    // /ping
    if (commandName === 'ping') {
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

    // ─── NEW /ask COMMAND ────────────────────────────────────────────────
    if (commandName === 'ask') {
      const prompt = interaction.options.getString('prompt');
      await interaction.deferReply();  // show “thinking…”

      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        if (!res.ok) throw new Error(`Worker returned ${res.status}`);
        const replyText = await res.text();
        return interaction.editReply(replyText);
      } catch (err) {
        console.error('ask → hallAI error:', err);
        return interaction.editReply('❌ Sorry, I couldn’t reach hallAI. Try again later.');
      }
    }
  } catch (err) {
    console.error('Error in interactionCreate:', err);
    if (interaction && !interaction.replied) {
      interaction.reply({ content: '⚠️ An internal error occurred.', ephemeral: true });
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
