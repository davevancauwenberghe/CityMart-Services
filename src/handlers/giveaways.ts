import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { Config } from '../config.js';
import { isSnowflake } from '../config.js';
import { UserError } from '../core.js';
import { embed, respond, literal, clip } from '../ui.js';
import type { Giveaways } from '../giveaways/service.js';
import { giveawayEnd } from '../giveaways/time.js';

export function requireOwner(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId)
    throw new UserError('Only this server’s owner can use this action.');
}
export async function entries(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  service: Giveaways,
  id: string,
  page = 0,
) {
  const value = service.scoped(id, interaction.guildId!);
  const pageCount = Math.max(1, Math.ceil(value.entrants.length / 25));
  page = Math.min(Math.max(0, page), pageCount - 1);
  const start = page * 25;
  const names = value.entrants
    .slice(start, start + 25)
    .map((actor, index) => `${start + index + 1}. <@${actor}>`);
  const result = embed(
    'Giveaway entries',
    `**${literal(value.prize)}**\n\n${names.join('\n') || 'No entries yet. Be the first to join!'}\n\nPage ${page + 1}/${pageCount} • ${value.entrants.length.toLocaleString()} entrants`,
    'giveaway',
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`entries:${id}:${interaction.user.id}:${page - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`entries:${id}:${interaction.user.id}:${page + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page + 1 >= pageCount),
  );
  if (interaction.isButton() && interaction.customId.startsWith('entries:'))
    await interaction.editReply({
      embeds: [result],
      components: [controls],
      allowedMentions: { parse: [] },
    });
  else await respond(interaction, [result], [controls]);
}
export async function giveawayCommand(
  interaction: ChatInputCommandInteraction,
  service: Giveaways,
  config: Config,
) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') {
    const values = service.store
      .list()
      .filter((value) => value.guildId === config.guildId)
      .sort((a, b) => Number(a.ended) - Number(b.ended) || b.endAt - a.endAt);
    const rows = values
      .slice(0, 10)
      .map(
        (value) =>
          `**${literal(value.prize, 120)}** — ${value.ended ? 'Ended' : `<t:${Math.floor(value.endAt / 1000)}:R>`}\n[Open giveaway](https://discord.com/channels/${value.guildId}/${value.channelId}/${value.messageId}) • ID: ${value.messageId}`,
      );
    return respond(interaction, [
      embed('CityMart giveaways', rows.join('\n\n') || 'There are no giveaways yet.', 'giveaway'),
    ]);
  }
  if (sub === 'start') {
    requireOwner(interaction);
    const prize = interaction.options.getString('prize', true).trim();
    if (!prize) throw new UserError('Enter a prize for the giveaway.');
    const endAt = giveawayEnd(
      interaction.options.getString('duration'),
      interaction.options.getString('end'),
      config.timeZone,
    );
    const url = await service.start(
      interaction.channelId,
      interaction.guildId!,
      interaction.user.id,
      prize,
      endAt,
    );
    return respond(interaction, [
      embed(
        'Giveaway started',
        `**${literal(prize)}**\nEnds <t:${Math.floor(endAt / 1000)}:F>.\n\n[Open giveaway](${url})`,
        'success',
      ),
    ]);
  }
  const id = interaction.options.getString('message_id', true);
  if (!isSnowflake(id))
    throw new UserError(
      'Enter the giveaway’s Discord message ID or choose an autocomplete result.',
    );
  if (sub === 'entries') return entries(interaction, service, id);
  requireOwner(interaction);
  if (sub === 'end' || sub === 'reroll') {
    const value = await service.finish(id, interaction.guildId!, sub === 'reroll');
    return respond(interaction, [
      embed(
        sub === 'end' ? 'Giveaway result delivered' : 'Giveaway rerolled',
        `**${literal(value.prize)}**\n${value.winnerId ? `Winner: <@${value.winnerId}>` : 'No entries were received.'}`,
        'success',
      ),
    ]);
  }
  if (sub === 'removeentrant') {
    const user = interaction.options.getUser('user', true);
    await service.remove(id, interaction.guildId!, user.id);
    return respond(interaction, [
      embed('Entrant removed', `${user} has been removed from the giveaway.`, 'success'),
    ]);
  }
  throw new UserError(
    'That giveaway action is no longer available. Open /help for the current commands.',
  );
}
export async function giveawayButton(interaction: ButtonInteraction, service: Giveaways) {
  const id = interaction.message.id;
  if (interaction.message.author.id !== interaction.client.user.id)
    throw new UserError('This is not a CityMart giveaway control.');
  if (interaction.customId === 'giveaway_entries') return entries(interaction, service, id);
  if (interaction.customId === 'giveaway_enter') {
    await service.join(id, interaction.guildId!, interaction.channelId, interaction.user.id);
    return respond(interaction, [
      embed(
        'You’re in!',
        'Your entry has been saved. Good luck! Use **View entries** on the giveaway to see the participants.',
        'success',
      ),
    ]);
  }
  const [, messageId, actor, rawPage] = interaction.customId.split(':');
  if (actor !== interaction.user.id)
    throw new UserError('Open the giveaway’s entry list yourself to use these controls.');
  if (!messageId || !rawPage || !/^-?\d{1,4}$/.test(rawPage))
    throw new UserError('This entry-list control is no longer valid.');
  return entries(interaction, service, messageId, Number(rawPage));
}
export async function autocomplete(interaction: AutocompleteInteraction, service: Giveaways) {
  const query = String(interaction.options.getFocused()).toLowerCase();
  const sub = interaction.options.getSubcommand();
  const values = service.store
    .list()
    .filter((value) => value.guildId === interaction.guildId)
    .filter((value) =>
      sub === 'end' ? !value.ended || !value.delivered : sub === 'reroll' ? value.ended : true,
    )
    .filter((value) => value.messageId.includes(query) || value.prize.toLowerCase().includes(query))
    .sort((a, b) => b.endAt - a.endAt)
    .slice(0, 25);
  await interaction.respond(
    values.map((value) => ({
      name: clip(`${value.ended ? 'Ended' : 'Active'} • ${value.prize} • ${value.messageId}`, 100),
      value: value.messageId,
    })),
  );
}
