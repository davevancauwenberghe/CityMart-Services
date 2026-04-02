require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// ---------------------- Environment validation ----------------------
['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'].forEach(name => {
  if (!process.env[name]) {
    console.error(`❌ Missing environment variable: ${name}`);
    process.exit(1);
  }
});

// Helper to mark commands as guild-only (no DMs)
const noDM = builder => builder.setDMPermission(false);

// ---------------------- Command definitions ----------------------
const commands = [
  // Basic utility / info
  noDM(
    new SlashCommandBuilder()
      .setName('keywords')
      .setDescription('Show all keywords and slash commands for CityMart Services')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('support')
      .setDescription('Get help and jump to the support channel')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check the bot latency')
  ),

  // Roblox / CityMart links
  noDM(
    new SlashCommandBuilder()
      .setName('community')
      .setDescription('Get the CityMart Group Roblox Community link')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('experience')
      .setDescription('Get the CityMart Shopping Experience link')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('application')
      .setDescription('Open the CityMart Application Centre')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('documentation')
      .setDescription('Open the CityMart documentation')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('lorebook')
      .setDescription('Open the CityMart Lore Book')
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('lamp')
      .setDescription("Shh... the lamp doesn't exist")
  ),

  // CityCraft
  noDM(
    new SlashCommandBuilder()
      .setName('citycraft')
      .setDescription('CityCraft Minecraft server info + whitelist request')
  ),

  // hallAI bridge
  noDM(
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
  ),

  // Roblox user lookup
  noDM(
    new SlashCommandBuilder()
      .setName('memberlookup')
      .setDescription('Look up a Roblox user and show their CityMart Group role')
      .addStringOption(opt =>
        opt
          .setName('username')
          .setDescription('Roblox username to look up')
          .setRequired(true)
          .setMaxLength(20)
      )
  ),

  // easyPOS activity
  noDM(
    new SlashCommandBuilder()
      .setName('activity')
      .setDescription('Show Roblox player activity (easyPOS)')
      .addStringOption(opt =>
        opt
          .setName('username')
          .setDescription('Roblox username to look up')
          .setRequired(true)
          .setMaxLength(20)
      )
  ),

  // easyPOS donations
  noDM(
    new SlashCommandBuilder()
      .setName('donations')
      .setDescription('Show how much a user has donated (easyPOS)')
      .addStringOption(opt =>
        opt
          .setName('username')
          .setDescription('Roblox username to look up')
          .setRequired(true)
          .setMaxLength(20)
      )
  ),

  noDM(
    new SlashCommandBuilder()
      .setName('donationsleaderboard')
      .setDescription('Show the top donations leaderboard (easyPOS)')
  ),

  // Roblox member count
  noDM(
    new SlashCommandBuilder()
      .setName('communitycount')
      .setDescription('Show the current CityMart Roblox Community member count')
  ),

  // Giveaways
  noDM(
    new SlashCommandBuilder()
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
              .setDescription('End date & time (YYYY-MM-DD HH:mm)')
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
      )
      .addSubcommand(sub =>
        sub
          .setName('removeentrant')
          .setDescription('Remove a user from a giveaway')
          .addStringOption(opt =>
            opt
              .setName('message_id')
              .setDescription('Giveaway message ID')
              .setRequired(true)
          )
          .addUserOption(opt =>
            opt
              .setName('user')
              .setDescription('User to remove from the giveaway')
              .setRequired(true)
          )
      )
  ),

  // Ranking (owner-only logic is handled in index.js)
  noDM(
    new SlashCommandBuilder()
      .setName('ranking')
      .setDescription('Promote or demote Roblox users via easyPOS ranking (owner only)')
      .addSubcommand(sub =>
        sub
          .setName('promote')
          .setDescription('Promote a Roblox user')
          .addStringOption(opt =>
            opt
              .setName('username')
              .setDescription('Roblox username to promote')
              .setRequired(true)
              .setMaxLength(20)
          )
          .addStringOption(opt =>
            opt
              .setName('scalecode')
              .setDescription('Scale code (only required if on minimum rank)')
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName('demote')
          .setDescription('Demote a Roblox user')
          .addStringOption(opt =>
            opt
              .setName('username')
              .setDescription('Roblox username to demote')
              .setRequired(true)
              .setMaxLength(20)
          )
      )
  )
].map(command => command.toJSON());

// ---------------------- REST client ----------------------
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ---------------------- Deploy commands ----------------------
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