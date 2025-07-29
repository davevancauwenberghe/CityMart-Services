require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const http = require('http');
const fs   = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SUPPORT_CHANNEL_ID = '1385699550005694586';
const GUILD_ID = process.env.GUILD_ID;
const THUMBNAIL_URL = 'https://cdn.discordapp.com/attachments/1399537105973018744/1399537106183000104/CityMart_Group_Discord_Transparent.png';

const TRIGGERS = [
  {
    keyword: 'community',
    embed: new EmbedBuilder()
      .setTitle('CityMart Community')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Hey there! 👋 Join our Roblox Community to chat with fellow CityMart shoppers, share tips, and stay up‑to‑date on all our events.')
      .setURL('https://www.roblox.com/communities/36060455/CityMart-Group#!/about')
      .setTimestamp()
  },
  {
    keyword: 'experience',
    embed: new EmbedBuilder()
      .setTitle('CityMart Shopping Experience')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('Ready for a shopping spree? 🛒 Visit our virtual CityMart store on Roblox and explore hundreds of items!')
      .setURL('https://www.roblox.com/games/84931510725955/CityMart-Shopping')
      .setTimestamp()
  },
  {
    keyword: 'support',
    embed: new EmbedBuilder()
      .setTitle('Need Help?')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription('If you’re stuck or have questions, click the button below to jump to our support channel!')
      .setColor(0xff9900)
      .setTimestamp()
  },
  {
    keyword: 'lorebook',
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
    embed: new EmbedBuilder()
      .setTitle('About the Lamp')
      .setColor(0xFFD700)
      .setDescription('💡 We don\'t talk about the lamp. The lamp doesn\'t exist.\n\nEver since that malicious lamp script from the Roblox toolbox infiltrated CityMart, no one dares mention it again. Handle with caution!')
      .setFooter({ text: 'Shh... the lamp is gone' })
      .setTimestamp()
  }
];

const HELP_EMBED = new EmbedBuilder()
  .setTitle('CityMart Services Help')
  .setThumbnail(THUMBNAIL_URL)
  .setColor(0x00FFAA)
  .addFields(
    { name: '🔗 Roblox Links', value: '• **community**\n• **experience**' },
    { name: '🆘 Support',        value: '• **support**' },
    { name: '📖 Misc',           value: '• **lorebook**\n• **lamp**' }
  )
  .setFooter({ text: 'Use @CityMart Services <keyword> to invoke a command' })
  .setTimestamp();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Mention‑based keyword handling
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const msg = message.content.toLowerCase();

  // lamp always fires
  if (/\blamp\b/.test(msg)) {
    const lampEmbed = TRIGGERS.find(t => t.keyword === 'lamp').embed;
    return message.channel.send({ content: `${message.author}`, embeds: [lampEmbed] });
  }

  // others require mention
  if (!message.mentions.has(client.user)) return;

  let handled = false;
  for (const trigger of TRIGGERS) {
    if (trigger.keyword === 'lamp') continue;
    const re = new RegExp(`\\b${trigger.keyword}\\b`);
    if (re.test(msg)) {
      let components = [];
      if (trigger.keyword === 'support') {
        const supportBtn = new ButtonBuilder()
          .setLabel('Go to Support')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${GUILD_ID}/${SUPPORT_CHANNEL_ID}`);
        components = [ new ActionRowBuilder().addComponents(supportBtn) ];
      }
      await message.channel.send({
        content: `${message.author}`,
        embeds: [trigger.embed],
        components
      });
      handled = true;
      break;
    }
  }

  if (!handled) {
    await message.channel.send({ content: `${message.author}`, embeds: [HELP_EMBED] });
  }
});

// Slash command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { commandName, createdTimestamp } = interaction;

  if (commandName === 'keywords') {
    await interaction.reply({ embeds: [HELP_EMBED], ephemeral: true });

  } else if (commandName === 'support') {
    const supportEmbed = TRIGGERS.find(t => t.keyword === 'support').embed;
    const supportBtn = new ButtonBuilder()
      .setLabel('Go to Support')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${SUPPORT_CHANNEL_ID}`);
    const row = new ActionRowBuilder().addComponents(supportBtn);
    await interaction.reply({ embeds: [supportEmbed], components: [row], ephemeral: false });

  } else if (commandName === 'ping') {
    const latency = Date.now() - createdTimestamp;
    const pingEmbed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setThumbnail(THUMBNAIL_URL)
      .setDescription(`Latency is **${latency}ms**`)
      .setColor(0x00FFAA)
      .setFooter({ text: 'CityMart Services' })
      .setTimestamp();
    await interaction.reply({ embeds: [pingEmbed], ephemeral: false });
  }
});

client.login(process.env.DISCORD_TOKEN);

// Simple HTTP server for landing page
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, (err, html) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Error loading page');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP server listening on 0.0.0.0:${PORT}`);
});
