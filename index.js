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
const SUPPORT_CHANNEL_ID = '1385699550005694586';

const TRIGGERS = [
  {
    keyword: 'community',
    embed: new EmbedBuilder()
      .setTitle('CityMart Community')
      .setDescription(
        `Hey there! 👋 Join our Roblox Community to chat with fellow CityMart shoppers, share tips, and stay up‑to‑date on all our events.`
      )
      .setURL('https://www.roblox.com/communities/36060455/CityMart-Group#!/about')
      .setTimestamp()
  },
  {
    keyword: 'experience',
    embed: new EmbedBuilder()
      .setTitle('CityMart Shopping Experience')
      .setDescription(
        `Ready for a shopping spree? 🛒 Visit our virtual CityMart store on Roblox and explore hundreds of items!`
      )
      .setURL('https://www.roblox.com/games/84931510725955/CityMart-Shopping')
      .setTimestamp()
  },
  {
    keyword: 'support',
    embed: new EmbedBuilder()
      .setTitle('Need Help?')
      .setDescription(
        `If you’re stuck or have questions, head over to <#${SUPPORT_CHANNEL_ID}> and one of our moderators will be happy to assist!`
      )
      .setColor(0xff9900)
      .setTimestamp()
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
      await message.channel.send({ content: mention, embeds: [trigger.embed] });
      break;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
