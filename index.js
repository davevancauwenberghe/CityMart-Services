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

// Thumbnail URL for embeds
const THUMBNAIL_URL = 'https://cdn.discordapp.com/attachments/1399537105973018744/1399537106183000104/CityMart_Group_Discord_Transparent.png';

// Define your mention‑based triggers (excluding 'lamp')
const TRIGGERS = [
  {
    keyword: 'community',
    embed: new EmbedBuilder()
      .setTitle('CityMart Community')
      .setThumbnail(THUMBNAIL_URL)
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
      .setThumbnail(THUMBNAIL_URL)
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
      .setThumbnail(THUMBNAIL_URL)
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
      .setThumbnail(THUMBNAIL_URL)
      .setColor(0x00AEFF)
      .setDescription(
        `Dive deeper into the history, secrets, and unprecedented lore of CityMart in our official Lore Book.`
      )
      .setURL('https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2?v=23eee5e2e2ec804aa1b3000c2018e0b9')
      .setFooter({ text: 'CityMart Lore' })
      .setTimestamp()
  },
  {
    // "lamp" will be handled globally (no mention needed)
    keyword: 'lamp',
    embed: new EmbedBuilder()
      .setTitle('About the Lamp')
      .setColor(0xFFD700)
      .setDescription(
        `💡 We don't talk about the lamp. The lamp doesn't exist.\n\n` +
        `Ever since that malicious lamp script from the Roblox toolbox infiltrated CityMart, ` +
        `no one dares mention it again. Handle with caution!`
      )
      .setFooter({ text: 'Shh... the lamp is gone' })
      .setTimestamp()
  }
];

// Help embed when no keyword is matched
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

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const msg = message.content.toLowerCase();

  // 1) Handle "lamp" anytime, no mention required
  if (/\blamp\b/.test(msg)) {
    const lampEmbed = TRIGGERS.find(t => t.keyword === 'lamp').embed;
    return message.channel.send({ content: `${message.author}`, embeds: [lampEmbed] });
  }

  // 2) All other keywords still require @CityMart Services ping
  if (!message.mentions.has(client.user)) return;

  let handled = false;
  for (const trigger of TRIGGERS) {
    if (trigger.keyword === 'lamp') continue; // already handled
    const re = new RegExp(`\\b${trigger.keyword}\\b`);
    if (re.test(msg)) {
      await message.channel.send({
        content: `${message.author}`,
        embeds: [trigger.embed]
      });
      handled = true;
      break;
    }
  }

  if (!handled) {
    // No keyword matched; send categorized help overview
    await message.channel.send({
      content: `${message.author}`,
      embeds: [HELP_EMBED]
    });
  }
});

// ─── Slash‑Command Handler ────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'keywords') {
    // Send the same categorized help embed, ephemeral
    await interaction.reply({
      embeds: [HELP_EMBED],
      ephemeral: true
    });

  } else if (commandName === 'support') {
    // Reuse the support embed so it remains consistent
    const supportEmbed = TRIGGERS.find(t => t.keyword === 'support').embed;
    await interaction.reply({
      embeds: [supportEmbed],
      ephemeral: false
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
