require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Validate required environment variables
['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].forEach(name => {
  if (!process.env[name]) {
    console.error(`❌ Missing environment variable: ${name}`);
    process.exit(1);
  }
});

// Define commands with consistent naming/descriptions
const commands = [
  new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('Show all keywords and slash commands for CityMart Services'),

  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help and jump to the support channel'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),

  new SlashCommandBuilder()
    .setName('community')
    .setDescription('Get the CityMart Group Roblox Community link'),

  new SlashCommandBuilder()
    .setName('experience')
    .setDescription('Get the CityMart Shopping Experience link'),

  new SlashCommandBuilder()
    .setName('lorebook')
    .setDescription('Open the CityMart Lore Book'),

  new SlashCommandBuilder()
    .setName('lamp')
    .setDescription("Shh... the lamp doesn't exist"),

  // hallAI bridge
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask hallAI a question')
    .addStringOption(opt =>
      opt
        .setName('prompt')
        .setDescription('Your question for hallAI')
        .setRequired(true)
        .setMaxLength(1000)
    )
].map(c => c.toJSON());

// Set up REST client
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands with timestamped logging
(async () => {
  try {
    console.log(`[${new Date().toISOString()}] 🔄 Refreshing application slash commands...`);
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log(`[${new Date().toISOString()}] ✅ Successfully registered ${commands.length} slash commands.`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error registering slash commands:`, err);
  }
})();
