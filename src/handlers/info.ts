import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ActivityType,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type Client,
} from 'discord.js';
import type { Config } from '../config.js';
import { VERSION, guildSettings } from '../config.js';
import { UserError } from '../core.js';
import { embed, links, respond, literal, clip } from '../ui.js';
import type { Roblox } from '../services/roblox.js';

const helpSections = {
  overview: [
    'Welcome to CityMart',
    'Use the menu below to explore services. All features use slash commands; ordinary messages do not trigger the bot.\n\n**Community:** links, support, member profiles and community size.\n**Players:** Roblox profiles and activity.\n**Tools:** hallAI, CityCraft and giveaways.\n**Owner:** giveaway management.',
  ],
  community: [
    'Community & support',
    '`/support` — contact the team\n`/community` — Roblox community\n`/experience` — play CityMart Shopping\n`/application` — application centre\n`/documentation` and `/lorebook` — guides and stories\n`/communitycount` — community size\n`/user [member]` — Discord member profile\n`/about` and `/ping` — service status\n`/lamp` — an entirely ordinary lamp',
  ],
  players: [
    'Player services',
    '`/memberlookup username` — Roblox profile and CityMart role\n`/activity username` — playtime and message activity\n\nUse account usernames rather than display names.',
  ],
  tools: [
    'Tools & events',
    '`/ask prompt [private] [reset]` — hallAI with your question and answer in one embed. Hall remembers up to 12 exchanges for 24 hours of inactivity, separately for each member, channel and reply mode. Use reset for a new conversation. Hall can search the public web when useful and includes clickable sources. Web-search and fresh-context labels appear when relevant. Keep private details out of search requests.\n`/forget [private]` — delete your Hall context in this channel; confirmation is private.\n`/citycraft` — server status, player count and a button to request whitelist access\n`/giveaway list` — active and recent giveaways\n`/giveaway entries message_id` — browse entries\n\nUse the **Enter giveaway** button on an active giveaway to join.',
  ],
  owner: [
    'Server owner tools',
    '`/giveaway start prize duration:2h` — start a giveaway\n`/giveaway start prize end:2026-12-20 18:00` — use the configured time zone instead\n`/giveaway end message_id` — draw early or retry a pending announcement\n`/giveaway reroll message_id` — choose a different winner\n`/giveaway removeentrant message_id user` — remove an entrant\n\nOnly this server’s owner can manage giveaways.',
  ],
} as const;
export async function help(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  section = 'overview',
) {
  const [title, description] =
    helpSections[section as keyof typeof helpSections] || helpSections.overview;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help:${interaction.user.id}`)
    .setPlaceholder('Explore CityMart services')
    .addOptions(
      Object.entries(helpSections).map(([value, [label]]) => ({
        label,
        value,
        default: value === section,
      })),
    );
  const payload = {
    embeds: [embed(title, description)],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    allowedMentions: { parse: [] as const },
  };
  if (interaction.isStringSelectMenu()) await interaction.update(payload);
  else await respond(interaction, payload.embeds, payload.components);
}
export async function info(
  interaction: ChatInputCommandInteraction,
  config: Config,
  client: Client,
  roblox: Roblox,
) {
  const command = interaction.commandName;
  if (command === 'help') return help(interaction);
  if (command === 'about') {
    return respond(interaction, [
      embed(
        'CityMart Services',
        'Community tools for CityMart, built by Dave Van Cauwenberghe.\n\nBrowse `/help` to find a service.',
      ).addFields(
        { name: 'Version', value: VERSION, inline: true },
        {
          name: 'Uptime',
          value: `<t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>`,
          inline: true,
        },
        { name: 'Discord', value: client.isReady() ? 'Connected' : 'Reconnecting', inline: true },
      ),
    ]);
  }
  if (command === 'ping')
    return respond(interaction, [
      embed('Pong!', 'CityMart Services is responding.').addFields(
        {
          name: 'Gateway latency',
          value: `${Math.max(0, Math.round(client.ws.ping))} ms`,
          inline: true,
        },
        {
          name: 'Interaction age',
          value: `${Math.max(0, Date.now() - interaction.createdTimestamp)} ms`,
          inline: true,
        },
      ),
    ]);
  if (command === 'support') {
    const { supportChannelId } = guildSettings(config, interaction.guildId!);
    return respond(
      interaction,
      [
        embed(
          'CityMart support',
          supportChannelId
            ? `Need a hand? Visit <#${supportChannelId}> and tell the team what happened. Please keep passwords and tokens private.`
            : 'Please contact the server’s moderation team for help.',
        ),
      ],
      supportChannelId
        ? [
            links([
              'Open support',
              `https://discord.com/channels/${interaction.guildId}/${supportChannelId}`,
            ]),
          ]
        : [],
    );
  }
  if (command === 'communitycount') {
    const count = await roblox.count();
    return respond(
      interaction,
      [
        embed(
          'CityMart community',
          `**${count.toLocaleString()}** shoppers and counting.`,
          'roblox',
        ),
      ],
      [links(['Join the community', `https://www.roblox.com/communities/${config.groupId}`])],
    );
  }
  if (command === 'lamp')
    return respond(interaction, [
      embed(
        'The lamp',
        'There is nothing unusual about this lamp. Please continue shopping.',
      ).setImage('https://storage.davevancauwenberghe.be/citymart/visuals/lamp.png'),
    ]);
  if (command === 'user') {
    const user = interaction.options.getUser('member') || interaction.user;
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (!member) throw new UserError('That user is not a member of this server.');
    const roles = member.roles.cache
      .filter((role) => role.id !== interaction.guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => `<@&${role.id}>`);
    return respond(
      interaction,
      [
        embed(
          `${literal(user.displayName, 200)} • Discord profile`,
          `${user}\n**Username:** ${literal(user.tag)}\n**User ID:** ${user.id}`,
        )
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            {
              name: 'Account created',
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
              inline: true,
            },
            {
              name: 'Joined CityMart',
              value: member.joinedTimestamp
                ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                : 'Not available',
              inline: true,
            },
            { name: 'Account type', value: user.bot ? 'Bot' : 'Member', inline: true },
            {
              name: `Roles (${roles.length})`,
              value: clip(roles.join(' ') || 'No additional roles', 1024),
            },
          ),
      ],
      [links(['View avatar', user.displayAvatarURL({ size: 1024 })])],
    );
  }
  const pages: Record<string, [string, string, string, string]> = {
    community: [
      'CityMart Roblox community',
      'Meet the CityMart community and follow the latest news.',
      'Join community',
      `https://www.roblox.com/communities/${config.groupId}`,
    ],
    experience: [
      'CityMart Shopping',
      'Your next shopping trip starts here.',
      'Play CityMart',
      'https://www.roblox.com/games/84931510725955/CityMart-Shopping',
    ],
    application: [
      'Work at CityMart',
      'Ready to join the team? Visit the Application Centre to get started.',
      'Apply now',
      'https://www.roblox.com/games/138757153564625/CityMart-Application-Centre',
    ],
    documentation: [
      'CityMart documentation',
      'Find guidance, policies and information about CityMart.',
      'Read documentation',
      'https://citymartgroup.gitbook.io/docs/',
    ],
    lorebook: [
      'CityMart Lore Book',
      'Explore the stories behind CityMart.',
      'Read the Lore Book',
      'https://nervous-flag-247.notion.site/23eee5e2e2ec800db586cd84bf80cbf2?v=23eee5e2e2ec804aa1b3000c2018e0b9',
    ],
  };
  const page = pages[command];
  if (!page)
    throw new UserError('That command has changed. Open /help for the current command list.');
  return respond(interaction, [embed(page[0], page[1])], [links([page[2], page[3]])]);
}

export async function updateCommunity(
  client: Client,
  config: Config,
  roblox: Roblox,
  previous: number | null,
) {
  const count = await roblox.count();
  client.user?.setActivity(`${count.toLocaleString()} shoppers`, { type: ActivityType.Watching });
  if (previous !== null && count !== previous && config.commandsChannelId) {
    const channel = await client.channels.fetch(config.commandsChannelId);
    if (!channel?.isTextBased() || channel.isDMBased() || channel.guildId !== config.guildId)
      throw new UserError('The configured community-update channel is unavailable.');
    const difference = count - previous;
    await channel.send({
      embeds: [
        embed(
          'CityMart community update',
          `**${count.toLocaleString()}** community members\n${difference > 0 ? '+' : ''}${difference.toLocaleString()} since the previous update.`,
          'roblox',
        ),
      ],
      allowedMentions: { parse: [] },
    });
  }
  return count;
}

export async function announceReady(client: Client, config: Config) {
  if (!config.generalChannelId) return;
  const channel = await client.channels.fetch(config.generalChannelId);
  if (!channel?.isTextBased() || channel.isDMBased() || channel.guildId !== config.guildId)
    throw new UserError('The startup announcement channel is unavailable.');
  await channel.send({
    embeds: [
      embed(
        'CityMart Services is ready',
        `Version **${VERSION}** is online. Use /help to explore community tools, player services and giveaways.`,
        'success',
      ),
    ],
    allowedMentions: { parse: [] },
  });
}
