require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Validate required environment variables
['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].forEach(name => {
  if (!process.env[name]) {
    console.error(`❌ Missing environment variable: ${name}`);
    process.exit(1);
  }
});

// Helper to mark commands as guild-only (no DMs)
const noDM = (builder) => builder.setDMPermission(false);

const commands = [
  noDM(new SlashCommandBuilder()
    .setName('keywords')
    .setDescription('Show all keywords and slash commands for CityMart Services')),

  noDM(new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help and jump to the support channel')),

  noDM(new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency')),

  noDM(new SlashCommandBuilder()
    .setName('community')
    .setDescription('Get the CityMart Group Roblox Community link')),

  noDM(new SlashCommandBuilder()
    .setName('experience')
    .setDescription('Get the CityMart Shopping Experience link')),

  noDM(new SlashCommandBuilder()
    .setName('application')
    .setDescription('Open the CityMart Application Centre')),

  noDM(new SlashCommandBuilder()
    .setName('documentation')
    .setDescription('Open the CityMart documentation')),

  noDM(new SlashCommandBuilder()
    .setName('lorebook')
    .setDescription('Open the CityMart Lore Book')),

  noDM(new SlashCommandBuilder()
    .setName('lamp')
    .setDescription("Shh... the lamp doesn't exist")),

  // hallAI bridge
  noDM(new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask hallAI a question')
    .addStringOption(opt =>
      opt
        .setName('prompt')
        .setDescription('Your question for hallAI')
        .setRequired(true)
        .setMaxLength(1000)
    )),

  // Roblox user lookup (with CityMart role)
  noDM(new SlashCommandBuilder()
    .setName('memberlookup')
    .setDescription('Look up a Roblox user and show their CityMart Group role')
    .addStringOption(opt =>
      opt
        .setName('username')
        .setDescription('Roblox username to look up')
        .setRequired(true)
        .setMaxLength(20)
    )),

  // Current Roblox community member count
  noDM(new SlashCommandBuilder()
    .setName('communitycount')
    .setDescription('Show the current CityMart Roblox Community member count')),

  // CityMart giveaways (owner-only logic is in handler)
  noDM(new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage CityMart giveaways')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start a new giveaway')
        .addStringOption(opt =>
          opt
            .setName('prize')
            .setDescription('What are you giving away?')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('end')
            .setDescription('End date & time (YYYY-MM-DD HH:mm UTC)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('End an active giveaway early')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('Giveaway message ID')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reroll')
        .setDescription('Reroll a winner for a finished giveaway')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('Giveaway message ID')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('entries')
        .setDescription('Show all entrants for a giveaway')
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('Giveaway message ID')
            .setRequired(true)
        )
    ))
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
    console.log(
      `[${new Date().toISOString()}] ✅ Successfully registered ${commands.length} slash commands.`
    );
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ❌ Error registering slash commands:`,
      err?.message || err
    );
    process.exit(1);
  }
})();
