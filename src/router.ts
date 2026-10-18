import type { Client, Interaction, ChatInputCommandInteraction } from 'discord.js';
import type { Config } from './config.js';
import { RateLimit, UserError, safeLog } from './core.js';
import { defer, respond, respondError, embed, literal } from './ui.js';
import { info, help } from './handlers/info.js';
import { lookup, ask, forget } from './handlers/lookups.js';
import {
  giveawayCommand,
  giveawayButton,
  autocomplete,
  requireOwner,
} from './handlers/giveaways.js';
import type { Roblox } from './services/roblox.js';
import type { Easypos } from './services/easypos.js';
import type { Minecraft } from './services/minecraft.js';
import type { Hallai } from './services/hallai.js';
import type { Giveaways } from './giveaways/service.js';
import type { Citycraft } from './handlers/citycraft.js';

export class Router {
  private recent = new Map<string, number>();
  private limits = new RateLimit(20, 60_000);
  private ranking = new Set<number>();
  readonly pending = new Set<Promise<void>>();
  stopping = false;
  constructor(
    private readonly config: Config,
    private readonly client: Client,
    private readonly services: {
      roblox: Roblox;
      easypos: Easypos;
      minecraft: Minecraft;
      hallai: Hallai;
      giveaways: Giveaways;
      citycraft: Citycraft;
    },
  ) {}
  handle(interaction: Interaction): void {
    const task = this.dispatch(interaction).then(() => undefined);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
  private async dispatch(interaction: Interaction) {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isModalSubmit() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isAutocomplete()
    )
      return;
    try {
      if (this.stopping) throw new UserError('CityMart is restarting. Please try again shortly.');
      if (interaction.guildId !== this.config.guildId)
        throw new UserError('These commands are available only in the CityMart server.');
      for (const [id, time] of this.recent)
        if (time < Date.now() - 15 * 60_000) this.recent.delete(id);
      if (this.recent.has(interaction.id)) return;
      if (this.recent.size >= 10_000)
        throw new UserError('CityMart is busy. Please try again shortly.');
      this.recent.set(interaction.id, Date.now());
      if (interaction.isAutocomplete())
        return await autocomplete(interaction, this.services.giveaways);
      this.limits.take(interaction.user.id);
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId !== `help:${interaction.user.id}`)
          throw new UserError('Open /help yourself to use its menu.');
        return await help(interaction, interaction.values[0]);
      }
      if (interaction.isButton()) {
        if (interaction.customId === 'citycraft_whitelist_request')
          return await this.services.citycraft.show(interaction);
        if (interaction.customId.startsWith('entries:')) {
          const actor = interaction.customId.split(':')[2];
          if (actor !== interaction.user.id)
            throw new UserError('Open the entry list yourself to use these controls.');
          await interaction.deferUpdate();
        } else await defer(interaction);
        if (
          interaction.customId.startsWith('giveaway_') ||
          interaction.customId.startsWith('entries:')
        )
          return await giveawayButton(interaction, this.services.giveaways);
        throw new UserError('This control has changed. Open /help for the current commands.');
      }
      if (interaction.isModalSubmit()) {
        await defer(interaction);
        if (interaction.customId.startsWith('citycraft:'))
          return await this.services.citycraft.submit(interaction);
        throw new UserError('This form has expired. Please open a new form from the command.');
      }
      if (
        interaction.commandName === 'citycraft' &&
        interaction.options.getSubcommand(false) === 'request'
      )
        return await this.services.citycraft.show(interaction);
      const privateReply =
        [
          'help',
          'about',
          'ping',
          'support',
          'citycraft',
          'user',
          'giveaway',
          'ranking',
          'forget',
        ].includes(interaction.commandName) ||
        (interaction.commandName === 'ask' && interaction.options.getBoolean('private') === true);
      await defer(interaction, privateReply);
      if (interaction.commandName === 'ask') return await ask(interaction, this.services.hallai);
      if (interaction.commandName === 'forget')
        return await forget(interaction, this.services.hallai);
      if (interaction.commandName === 'citycraft')
        return await this.services.citycraft.info(interaction);
      if (interaction.commandName === 'giveaway')
        return await giveawayCommand(interaction, this.services.giveaways, this.config);
      if (interaction.commandName === 'ranking') return await this.rank(interaction);
      if (
        ['memberlookup', 'activity', 'donations', 'donationsleaderboard', 'minecraft'].includes(
          interaction.commandName,
        )
      )
        return await lookup(
          interaction,
          this.services.roblox,
          this.services.easypos,
          this.services.minecraft,
        );
      await info(interaction, this.config, this.client, this.services.roblox);
    } catch (error) {
      if (!(error instanceof UserError)) safeLog('interaction_failed', error);
      try {
        if (interaction.isAutocomplete()) {
          if (!interaction.responded) await interaction.respond([]);
        } else await respondError(interaction, error);
      } catch (replyError) {
        safeLog('interaction_reply_failed', replyError);
      }
    }
  }
  private async rank(interaction: ChatInputCommandInteraction) {
    requireOwner(interaction);
    const action = interaction.options.getSubcommand();
    if (action !== 'promote' && action !== 'demote')
      throw new UserError('Choose promote or demote.');
    const user = await this.services.roblox.lookup(
      interaction.options.getString('username', true).trim(),
    );
    if (this.ranking.has(user.id))
      throw new UserError('A rank change for that user is already in progress. Please wait.');
    this.ranking.add(user.id);
    try {
      const rank = await this.services.easypos.rank(
        action,
        user.id,
        interaction.options.getString('scale_code') || interaction.options.getString('scalecode'),
      );
      await respond(interaction, [
        embed(
          'Roblox rank updated',
          `**${literal(user.name)}** was ${action === 'promote' ? 'promoted' : 'demoted'}.\n\n**New rank:** ${literal(rank)}`,
          'success',
        ),
      ]);
    } finally {
      this.ranking.delete(user.id);
    }
  }
}
