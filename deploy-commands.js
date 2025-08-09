require('dotenv').config();
const chalk = require('chalk');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Validate required env vars
['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].forEach(name => {
  if (!process.env[name]) {
    console.error(chalk.bgRed.white(`❌ Missing environment variable: ${name}`));
    process.exit(1);
  }
});

const commands = [
  new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('View keywords available with CityMart Services'),
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help and support information'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),
  new SlashCommandBuilder()
    .setName('community')
    .setDescription('Get the CityMart Group Roblox community link'),
  new SlashCommandBuilder()
    .setName('experience')
    .setDescription('Get the CityMart Shopping Experience link'),
  new SlashCommandBuilder()
    .setName('lorebook')
    .setDescription('Open the CityMart Lore Book'),
  new SlashCommandBuilder()
    .setName('lamp')
    .setDescription('Discover the mysterious lamp'),
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask hallAI a question')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Enter your question for hallAI')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      chalk.cyan(`[${new Date().toISOString()}] 🔄 Refreshing application slash commands...`)
    );
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log(
      chalk.green(`[${new Date().toISOString()}] ✅ Successfully registered ${commands.length} slash commands.`)
    );
  } catch (err) {
    console.error(
      chalk.red(`[${new Date().toISOString()}] ❌ Error registering slash commands:`),
      err
    );
  }
})();
