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
import { isMinecraftUsername } from '../services/minecraft.js';

export class Citycraft {
  private modals = new Map<string, { actor: string; guild: string; expires: number }>();
  private limit = new RateLimit(1, 10 * 60_000);
  constructor(
    private readonly client: Client,
    private readonly config: Config,
  ) {}
  async info(interaction: ChatInputCommandInteraction) {
    return respond(
      interaction,
      [
        embed(
          'Welcome to CityCraft',
          `CityMart’s Minecraft community.\n\n**Server address:** ${literal(this.config.citycraftAddress)}\n\nRequest whitelist access below. Your Minecraft username and Discord account will be sent privately to the server owner.`,
          'minecraft',
        ),
      ],
      [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('citycraft_whitelist_request')
            .setLabel('Request whitelist access')
            .setStyle(ButtonStyle.Success),
        ),
      ],
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
      throw new UserError('This request form expired. Use /citycraft request to open a new one.');
    this.modals.delete(interaction.customId);
    const username = interaction.fields.getTextInputValue('username').trim();
    const edition = interaction.fields.getStringSelectValues('edition')[0];
    if (edition !== 'java' && edition !== 'bedrock')
      throw new UserError(
        'Enter Java or Bedrock for the edition. Open /citycraft request to try again.',
      );
    if (
      edition === 'java'
        ? !isMinecraftUsername(username)
        : !/^[A-Za-z0-9][A-Za-z0-9 _]{2,15}$/.test(username)
    )
      throw new UserError(
        'That Minecraft username is not valid for the selected edition. Open /citycraft request to try again.',
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
