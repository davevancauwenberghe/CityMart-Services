import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { Config } from '../config.js';
import { guildSettings } from '../config.js';
import { KeyedLock, UserError, safeLog, object } from '../core.js';
import { embed, message, literal, links } from '../ui.js';
import { GiveawayStore, type Giveaway } from './store.js';

export function giveawayView(value: Giveaway, enabled = true) {
  const end = Math.floor(value.endAt / 1000);
  const description = value.ended
    ? `**${literal(value.prize)}**\n\n${value.winnerId ? `Winner: <@${value.winnerId}>` : 'No eligible entries were received.'}\n${value.revision > 1 ? `Draw ${value.revision} • previous winners are excluded from rerolls.\n` : ''}Hosted by <@${value.createdBy}>.`
    : `**${literal(value.prize)}**\n\nUse **Enter giveaway** below to take part.\nEnds <t:${end}:F> (<t:${end}:R>).\nHosted by <@${value.createdBy}>.`;
  return message(
    [
      embed(
        value.ended ? 'Giveaway ended' : 'CityMart giveaway',
        description,
        'giveaway',
      ).addFields({ name: 'Entries', value: value.entrants.length.toLocaleString(), inline: true }),
    ],
    [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('giveaway_enter')
          .setLabel(value.ended ? 'Giveaway ended' : 'Enter giveaway')
          .setStyle(ButtonStyle.Success)
          .setDisabled(value.ended || !enabled),
        new ButtonBuilder()
          .setCustomId('giveaway_entries')
          .setLabel('View entries')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!enabled),
      ),
    ],
  );
}
export class Giveaways {
  private lock = new KeyedLock();
  constructor(
    readonly store: GiveawayStore,
    private readonly client: Client,
    private readonly config: Config,
  ) {}
  scoped(id: string, guildId: string): Giveaway {
    const value = this.store.get(id);
    if (value.guildId !== guildId || !this.config.guildIds.includes(guildId))
      throw new UserError('This giveaway belongs to a different server.');
    return value;
  }
  private async channel(
    value: Pick<Giveaway, 'channelId' | 'guildId'>,
  ): Promise<GuildTextBasedChannel> {
    if (!this.config.guildIds.includes(value.guildId))
      throw new UserError('This server is not configured for giveaways.');
    const channel = await this.client.channels.fetch(value.channelId);
    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased() ||
      channel.guildId !== value.guildId
    )
      throw new UserError('The giveaway channel is no longer available.');
    return channel;
  }
  async start(channelId: string, guildId: string, createdBy: string, prize: string, endAt: number) {
    const channel = await this.channel({ channelId, guildId });
    const permissions = channel.permissionsFor(this.client.user!);
    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ]) ||
      (channel.isThread() && !permissions.has(PermissionFlagsBits.SendMessagesInThreads))
    )
      throw new UserError(
        'I need View Channel, Send Messages, Embed Links and Read Message History permissions here (and Send Messages in Threads when applicable).',
      );
    const value: Giveaway = {
      messageId: '',
      guildId,
      channelId,
      createdBy,
      prize,
      endAt,
      entrants: [],
      ended: false,
      winnerId: null,
      winnerHistory: [],
      revision: 0,
      delivered: false,
      messageUpdated: false,
      announcementId: null,
      dmAttempted: false,
    };
    const posted = await channel.send(giveawayView(value, false));
    value.messageId = posted.id;
    try {
      await this.store.add(value);
    } catch (error) {
      await posted.delete().catch(() => undefined);
      throw error;
    }
    // The durable record comes first; the scheduler repairs a failed button activation.
    try {
      await this.lock.run(value.messageId, () => this.refresh(value));
    } catch (error) {
      safeLog('giveaway_activation_pending', error);
    }
    return posted.url;
  }
  async join(id: string, guildId: string, channelId: string, actor: string) {
    return this.lock.run(id, async () => {
      const value = this.scoped(id, guildId);
      if (value.channelId !== channelId)
        throw new UserError('This button does not match the saved giveaway.');
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(actor);
      if (member.user.bot) throw new UserError('Bot accounts cannot enter giveaways.');
      const { minRoleId } = guildSettings(this.config, guildId);
      if (minRoleId) {
        const role = await guild.roles.fetch(minRoleId);
        if (!role)
          throw new UserError(
            'Giveaway eligibility is unavailable because the configured minimum role was removed. Please contact the server owner.',
          );
        if (member.roles.highest.comparePositionTo(role) < 0)
          throw new UserError(`You need the ${literal(role.name)} role or a higher role to enter.`);
      }
      const updated = await this.store.join(id, actor);
      // Entry is already durable; a display refresh failure must not undo or duplicate it.
      try {
        await this.refresh(updated);
      } catch (error) {
        safeLog('giveaway_entry_display_failed', error);
      }
    });
  }
  async finish(id: string, guildId: string, reroll = false) {
    return this.lock.run(id, async () => {
      this.scoped(id, guildId);
      const value = await this.store.draw(id, reroll);
      await this.deliver(value);
      return this.store.get(id);
    });
  }
  async remove(id: string, guildId: string, actor: string) {
    return this.lock.run(id, async () => {
      this.scoped(id, guildId);
      const updated = await this.store.change(id, (value) => {
        if (value.ended)
          throw new UserError('Entries cannot be changed after a giveaway has ended.');
        if (!value.entrants.includes(actor))
          throw new UserError('That user has not entered this giveaway.');
        value.entrants = value.entrants.filter((id) => id !== actor);
        value.messageUpdated = false;
      });
      try {
        await this.refresh(updated);
      } catch (error) {
        safeLog('giveaway_entry_display_failed', error);
      }
    });
  }
  private async refresh(value: Giveaway) {
    await (await this.channel(value)).messages.edit(value.messageId, giveawayView(value));
    await this.store.change(value.messageId, (record) => {
      record.messageUpdated = true;
    });
  }
  private async deliver(initial: Giveaway) {
    if (initial.delivered) return;
    let value = initial;
    const channel = await this.channel(value);
    if (!value.messageUpdated) {
      try {
        await channel.messages.edit(value.messageId, giveawayView(value));
      } catch (error) {
        if (object(error).code !== 10008)
          throw error; /* Deleted original: announce in the saved channel. */
      }
      value = await this.store.change(value.messageId, (record) => {
        record.messageUpdated = true;
      });
    }
    if (!value.announcementId) {
      const announcement = await channel.send({
        ...message([
          embed(
            value.revision > 1 ? 'Giveaway rerolled' : 'Giveaway result',
            `**${literal(value.prize)}**\n\n${value.winnerId ? `Congratulations, <@${value.winnerId}>! Please contact the support team to claim your prize.` : 'This giveaway ended without any entries.'}\n\n[View giveaway](https://discord.com/channels/${value.guildId}/${value.channelId}/${value.messageId})`,
            'giveaway',
          ),
        ]),
        nonce: `${value.messageId.slice(-17)}-${value.revision}`,
        enforceNonce: true,
      });
      value = await this.store.change(value.messageId, (record) => {
        record.announcementId = announcement.id;
      });
    }
    if (!value.dmAttempted) {
      // Persist before attempting a DM: a restart must not spam the winner. Closed DMs are nonfatal.
      value = await this.store.change(value.messageId, (record) => {
        record.dmAttempted = true;
      });
      if (value.winnerId) {
        const { supportChannelId } = guildSettings(this.config, value.guildId);
        try {
          const winner = await this.client.users.fetch(value.winnerId);
          await winner.send(
            message(
              [
                embed(
                  'You won a CityMart giveaway!',
                  `Your prize: **${literal(value.prize)}**\n\nContact the support team to claim it.\n[View the result](https://discord.com/channels/${value.guildId}/${value.channelId}/${value.announcementId})`,
                  'giveaway',
                ),
              ],
              supportChannelId
                ? [
                    links([
                      'Contact support',
                      `https://discord.com/channels/${value.guildId}/${supportChannelId}`,
                    ]),
                  ]
                : [],
            ),
          );
        } catch (error) {
          safeLog('giveaway_winner_dm_unavailable', error);
        }
      }
    }
    await this.store.change(value.messageId, (record) => {
      record.delivered = true;
    });
  }
  async tick(now = Date.now()) {
    for (const value of this.store.list()) {
      if (!this.config.guildIds.includes(value.guildId) || (value.ended && value.delivered))
        continue;
      try {
        if (!value.ended && value.endAt > now) {
          if (!value.messageUpdated)
            await this.lock.run(value.messageId, async () => {
              const current = this.store.get(value.messageId);
              if (!current.ended && !current.messageUpdated) await this.refresh(current);
            });
        } else await this.finish(value.messageId, value.guildId);
      } catch (error) {
        safeLog('giveaway_delivery_or_display_pending', error);
      }
    }
  }
}
