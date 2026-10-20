import { REST, Routes, SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';
import type { Config } from './config.js';
const base = (name: string, description: string) =>
  new SlashCommandBuilder().setName(name).setDescription(description);
function username<T extends SlashCommandBuilder | SlashCommandSubcommandBuilder>(command: T): T {
  command.addStringOption((option) =>
    option
      .setName('username')
      .setDescription('Roblox username, not display name')
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(20),
  );
  return command;
}
const giveawayId = (command: SlashCommandSubcommandBuilder) =>
  command.addStringOption((option) =>
    option
      .setName('message_id')
      .setDescription('Giveaway message ID (type a prize to search)')
      .setRequired(true)
      .setAutocomplete(true),
  );
export const commands = [
  base('help', 'Browse CityMart commands and services'),
  base('about', 'About CityMart Services and its status'),
  base('support', 'Find the CityMart support team'),
  base('ping', 'Check bot responsiveness'),
  base('community', 'Open the CityMart Roblox community'),
  base('experience', 'Play CityMart Shopping on Roblox'),
  base('application', 'Apply to work at CityMart'),
  base('documentation', 'Read the CityMart documentation'),
  base('lorebook', 'Read the CityMart Lore Book'),
  base('lamp', 'Investigate a suspiciously ordinary lamp'),
  base('citycraft', 'View CityCraft server status and request whitelist access'),
  base('ask', 'Ask hallAI a question')
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Your question (sent to hallAI with recent conversation context)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1000),
    )
    .addBooleanOption((option) =>
      option.setName('private').setDescription('Only you can see this answer (default: public)'),
    )
    .addBooleanOption((option) =>
      option.setName('reset').setDescription('Start a fresh conversation before asking'),
    ),
  base('forget', 'Delete your Hall conversation memory in this channel').addBooleanOption(
    (option) =>
      option
        .setName('private')
        .setDescription('Clear private /ask context (default: clear public context)'),
  ),
  username(base('memberlookup', 'View a Roblox profile and CityMart community role')),
  username(base('activity', 'View a Roblox player’s CityMart activity')),
  base('communitycount', 'View the current CityMart community member count'),
  base('user', 'View a Discord member’s profile and server details').addUserOption((option) =>
    option.setName('member').setDescription('Member to look up (default: you)'),
  ),
  base('giveaway', 'Enter, view and manage CityMart giveaways')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a giveaway in this channel (server owner)')
        .addStringOption((option) =>
          option
            .setName('prize')
            .setDescription('What can participants win?')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(200),
        )
        .addStringOption((option) =>
          option
            .setName('duration')
            .setDescription('Choose a duration, such as 30m, 2h or 7d; or use end')
            .setMaxLength(6),
        )
        .addStringOption((option) =>
          option
            .setName('end')
            .setDescription(
              'End date in the configured time zone: YYYY-MM-DD HH:mm; or use duration',
            )
            .setMinLength(16)
            .setMaxLength(16),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List active and recent giveaways'))
    .addSubcommand((sub) =>
      giveawayId(
        sub.setName('end').setDescription('End a giveaway early or retry delivery (server owner)'),
      ),
    )
    .addSubcommand((sub) =>
      giveawayId(
        sub
          .setName('reroll')
          .setDescription('Choose a new winner excluding previous winners (server owner)'),
      ),
    )
    .addSubcommand((sub) =>
      giveawayId(sub.setName('entries').setDescription('Browse giveaway entries')),
    )
    .addSubcommand((sub) =>
      giveawayId(
        sub.setName('removeentrant').setDescription('Remove an entrant (server owner)'),
      ).addUserOption((option) =>
        option.setName('user').setDescription('Entrant to remove').setRequired(true),
      ),
    ),
].map((command) => command.toJSON());

export async function registerCommands(config: Config, applicationId: string) {
  const rest = new REST({ version: '10', timeout: 15_000 }).setToken(config.token);
  // Guild-scoped replacement also removes deprecated commands/subcommands.
  const results = [];
  for (const guildId of config.guildIds)
    results.push(
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
        body: commands,
      }),
    );
  return results;
}
