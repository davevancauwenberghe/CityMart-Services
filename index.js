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

// Define your triggers
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
  },
  {
    keyword: 'lorebook',
    embed: new EmbedBuilder()
      .setTitle('CityMart Lore Book')
      .setColor(0x00AEFF)
      .setDescription(
        `Dive deeper into the history, secrets, and unprecedented lore of CityMart in our official Lore Book.`
      )
      .setURL('https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2?v=23eee5e2e2ec804aa1b3000c2018e0b9')
      .setFooter({ text: 'CityMart Lore' })
      .setTimestamp()
  }
];

// Default help embed when no keyword is matched
const HELP_EMBED = new EmbedBuilder()
  .setTitle('Hello from CityMart Services!')
  .setDescription(
    `I’m here to help you with the following commands:\n\n` +
    `• **community** – Get the Roblox Community link\n` +
    `• **experience** – Check out our CityMart Shopping Experience\n` +
    `• **support** – Find out how to get help\n` +
    `• **lorebook** – Read our detailed Lore Book\n\n` +
    `Usage: \`@CityMart Services <keyword>\``
  )
  .setColor(0x00FFAA)
  .setFooter({ text: 'Need anything else? Just ping me!' })
  .setTimestamp();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.mentions.has(client.user)) return;

  const content = message.content.toLowerCase();
  let handled = false;

  for (const trigger of TRIGGERS) {
    const re = new RegExp(`\\b${trigger.keyword}\\b`);
    if (re.test(content)) {
      const mention = `${message.author}`;
      await message.channel.send({ content: mention, embeds: [trigger.embed] });
      handled = true;
      break;
    }
  }

  if (!handled) {
    // No keyword matched; send help overview
    await message.channel.send({
      content: `${message.author}`,
      embeds: [HELP_EMBED]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
