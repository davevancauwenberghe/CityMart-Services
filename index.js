// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Replace with your actual Support channel ID:
const SUPPORT_CHANNEL_ID = 'YOUR_SUPPORT_CHANNEL_ID';

const TRIGGERS = [
  {
    keyword: 'community',
    embed: new EmbedBuilder()
      .setTitle('CityMart Community')
      .setDescription('✅ Roblox Community')
      .setURL('https://www.roblox.com/communities/36060455/CityMart-Group#!/about')
  },
  {
    keyword: 'experience',
    embed: new EmbedBuilder()
      .setTitle('CityMart Shopping Experience')
      .setDescription('🎮 Jump in now!')
      .setURL('https://www.roblox.com/games/84931510725955/CityMart-Shopping')
  },
  {
    keyword: 'support',
    text: user =>
      `${user} For support, please head over to <#${SUPPORT_CHANNEL_ID}>.`
  }
];

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.mentions.has(client.user)) return;

  const content = message.content.toLowerCase();
  for (const trigger of TRIGGERS) {
    if (content.includes(trigger.keyword)) {
      const mention = `${message.author}`;
      if (trigger.embed) {
        await message.channel.send({ content: mention, embeds: [trigger.embed] });
      } else {
        await message.channel.send(trigger.text(mention));
      }
      break;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
