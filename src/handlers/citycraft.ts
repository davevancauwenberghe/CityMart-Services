import { randomBytes } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Config } from '../config.js';
import { RateLimit, UserError } from '../core.js';
import { embed, message, respond, literal } from '../ui.js';
import { CitycraftStatus } from '../services/citycraft-status.js';

export class Citycraft {
  private modals = new Map<string, { actor: string; guild: string; expires: number }>();
  private limit = new RateLimit(1, 10 * 60_000);
  constructor(
    private readonly client: Client,
    private readonly config: Config,
    private readonly status = new CitycraftStatus({
      host: config.citycraftStatusHost,
      port: config.citycraftStatusPort,
      address: config.citycraftAddress,
    }),
  ) {}
  async info(interaction: ChatInputCommandInteraction) {
    const status = await this.status.check();
    const result = embed(
      'Welcome to CityCraft',
      `CityMart’s Minecraft community.\n\n**Server address:** ${literal(this.config.citycraftAddress)}\n\nRequest whitelist access below. Your Minecraft username and Discord account will be sent privately to the server owner.`,
      'minecraft',
    ).addFields(
      {
        name: 'Server status',
        value:
          status.state === 'online'
            ? 'Online'
            : status.state === 'unreachable'
              ? 'Offline or unreachable'
              : 'Status unavailable',
        inline: true,
      },
      {
        name: 'Players',
        value: status.players ? `${status.players.online} / ${status.players.max}` : '—',
        inline: true,
      },
      {
        name: 'Ping',
        value: status.latencyMs === undefined ? '—' : `${status.latencyMs} ms`,
        inline: true,
      },
    );
    if (status.version)
      result.addFields({
        name: 'Server version',
        value: literal(status.version, 150),
        inline: true,
      });
    result.addFields({
      name: 'Last checked',
      value: `<t:${Math.floor(status.checkedAt / 1000)}:R> · cached for up to 20 seconds`,
    });
    return respond(
      interaction,
      [result],
      [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('citycraft_whitelist_request')
            .setLabel('Request whitelist access')
            .setStyle(ButtonStyle.Success),
        ),
      ],
      false,
    );
  }
  async show(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    for (const [key, value] of this.modals)
      if (value.expires <= Date.now()) this.modals.delete(key);
    if (this.modals.size >= 500)
      throw new UserError('Whitelist requests are busy. Please try again shortly.');
    const key = `citycraft:${randomBytes(12).toString('hex')}`;
    this.modals.set(key, {
      actor: interaction.user.id,
      guild: interaction.guildId!,
      expires: Date.now() + 10 * 60_000,
    });
    const modal = new ModalBuilder()
      .setCustomId(key)
      .setTitle('CityCraft whitelist request')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Minecraft username')
          .setDescription('Java: exact username. Bedrock: gamertag, without a leading dot.')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('username')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(3)
              .setMaxLength(16),
          ),
        new LabelBuilder()
          .setLabel('Edition')
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId('edition')
              .setRequired(true)
              .addOptions(
                { label: 'Java Edition', value: 'java' },
                { label: 'Bedrock Edition', value: 'bedrock' },
              ),
          ),
      );
    await interaction.showModal(modal);
  }
  async submit(interaction: ModalSubmitInteraction) {
    const modal = this.modals.get(interaction.customId);
    if (
      !modal ||
      modal.actor !== interaction.user.id ||
      modal.guild !== interaction.guildId ||
      modal.expires <= Date.now()
    )
      throw new UserError(
        'This request form expired. Open /citycraft and use Request whitelist access to try again.',
      );
    this.modals.delete(interaction.customId);
    const username = interaction.fields.getTextInputValue('username').trim();
    const edition = interaction.fields.getStringSelectValues('edition')[0];
    if (edition !== 'java' && edition !== 'bedrock')
      throw new UserError(
        'Choose Java or Bedrock for the edition. Open /citycraft and use Request whitelist access to try again.',
      );
    if (
      edition === 'java'
        ? !/^[A-Za-z0-9_]{3,16}$/.test(username)
        : !/^[A-Za-z0-9][A-Za-z0-9 _]{2,15}$/.test(username)
    )
      throw new UserError(
        'That Minecraft username is not valid for the selected edition. Open /citycraft and use Request whitelist access to try again.',
      );
    this.limit.take(interaction.user.id);
    const owner = await this.client.users.fetch(this.config.citycraftOwnerId);
    await owner.send(
      message([
        embed(
          'CityCraft whitelist request',
          `**Minecraft username:** ${literal(username)}\n**Edition:** ${edition === 'java' ? 'Java' : 'Bedrock'}\n**Requested by:** ${interaction.user}\n**Discord username:** ${literal(interaction.user.tag)}\n**Discord user ID:** ${interaction.user.id}`,
          'minecraft',
        ).setThumbnail(interaction.user.displayAvatarURL()),
      ]),
    );
    return respond(interaction, [
      embed(
        'Whitelist request sent',
        `Your request for **${literal(username)}** (${edition === 'java' ? 'Java' : 'Bedrock'}) has been sent to the CityCraft owner. The team will contact you after reviewing it.`,
        'success',
      ),
    ]);
  }
}
