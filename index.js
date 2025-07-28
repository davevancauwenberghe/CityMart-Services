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
  },
  {
    keyword: 'lore',
    embed: new EmbedBuilder()
      .setTitle('CityMart Lore & Ban Tale')
      .setColor(0xFFD700)
      .setDescription(
        `In June 2025, in the bustling world of Roblox, .davevc founded CityMart, a shopping experience like no other.  
        It was deemed so special by Roblox it even received an automated “terrorism/extremism” flag leading to a 7‑day ban!  
        Fear not—CityMart will live on. Or so we hope 😅`
      )
      .addFields(
        { name: 'Founder', value: '.davevc', inline: true },
        { name: 'Founded', value: 'June 2025', inline: true },
        { name: 'Ban Date', value: 'July 28, 2025', inline: true },
        { name: 'Reactivates', value: 'Aug 04, 2025, 02:36 AM GMT+2', inline: true },
        { name: 'Vision', value: 'A shopping experience on Roblox' }
      )
      .setImage('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdXU2d2JocTRqanB4eWQ5ZGJkNHh0djhhMWc0c3Vta2I5YXh2dnZjNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YezX89ZyL4jvtJDtpQ/giphy.gif')
      .setFooter({ text: 'CityMart Lore' })
      .setTimestamp()
  },
  {
    keyword: 'lorebook',
    embed: new EmbedBuilder()
      .setTitle('CityMart Lore Book')
      .setColor(0x00AEFF)
      .setDescription(
        `Dive deeper into the history, secrets, and behind‑the‑scenes stories of CityMart in our official Lore Book. Created and curated by Imbeane.`
      )
      .setURL('https://discord.com/channels/1385065664892633098/1385065666637201462/1399209359560675398')
      .setFooter({ text: 'CityMart Lore' })
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
