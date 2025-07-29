// deploy-commands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('View what keywords you can use with CityMart Services'),
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help and support information'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Refreshing application slash-commands...');
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log('✅ Successfully registered slash-commands.');
  } catch (err) {
    console.error(err);
  }
})();
