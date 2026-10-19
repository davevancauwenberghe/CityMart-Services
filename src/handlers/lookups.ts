import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { VERSION } from '../config.js';
import { UserError, safeLog } from '../core.js';
import { embed, links, respond, literal, clip, message, splitAnswer } from '../ui.js';
import type { Roblox, RobloxUser } from '../services/roblox.js';
import type { Easypos } from '../services/easypos.js';
import { HallFailure, type Hallai, type HallReply } from '../services/hallai.js';

const profileUrl = (id: number) => `https://www.roblox.com/users/${id}/profile`;
const fmt = (value: number | null) => (value === null ? 'Not available' : value.toLocaleString());
function profileEmbed(user: RobloxUser, title: string, description: string) {
  const result = embed(title, description, 'roblox')
    .setURL(profileUrl(user.id))
    .setAuthor({
      name: `${user.displayName} (@${user.name})`,
      url: profileUrl(user.id),
      ...(user.avatar ? { iconURL: user.avatar } : {}),
    });
  if (user.avatar) result.setThumbnail(user.avatar);
  return result;
}
export async function lookup(
  interaction: ChatInputCommandInteraction,
  roblox: Roblox,
  easypos: Easypos,
) {
  const command = interaction.commandName;
  const user = await roblox.lookup(interaction.options.getString('username', true).trim());
  const buttons = [links(['Roblox profile', profileUrl(user.id)])];
  if (command === 'memberlookup') {
    const role = await roblox.role(user.id);
    const created = Date.parse(user.created);
    return respond(
      interaction,
      [
        profileEmbed(user, 'Roblox member lookup', literal(user.description, 1800)).addFields(
          {
            name: 'CityMart role',
            value: role ? literal(role.name) : 'Not a community member',
            inline: true,
          },
          { name: 'Rank', value: role ? String(role.rank) : '—', inline: true },
          {
            name: 'Account created',
            value: Number.isFinite(created)
              ? `<t:${Math.floor(created / 1000)}:D>`
              : 'Not available',
            inline: true,
          },
          { name: 'Roblox ID', value: String(user.id), inline: true },
        ),
      ],
      buttons,
    );
  }
  if (command === 'activity') {
    const data = await easypos.activity(user.id);
    return respond(
      interaction,
      [
        profileEmbed(
          user,
          'CityMart activity',
          `**In game:** ${data.inGame === null ? 'Not available' : data.inGame ? 'Yes' : 'No'}`,
        ).addFields(
          { name: 'Playtime • total', value: literal(data.playtime.total), inline: true },
          { name: 'Playtime • month', value: literal(data.playtime.month), inline: true },
          { name: 'Playtime • week', value: literal(data.playtime.week), inline: true },
          { name: 'Messages • total', value: fmt(data.messages.total), inline: true },
          { name: 'Messages • month', value: fmt(data.messages.month), inline: true },
          { name: 'Messages • week', value: fmt(data.messages.week), inline: true },
          { name: 'Playtime position', value: fmt(data.playtime.position), inline: true },
          { name: 'Message position', value: fmt(data.messages.position), inline: true },
        ),
      ],
      buttons,
    );
  }
  throw new UserError(
    'That player service is no longer available. Open /help for the current commands.',
  );
}

export async function ask(interaction: ChatInputCommandInteraction, hallai: Hallai) {
  const prompt = interaction.options.getString('prompt', true);
  const question = `**Your question**\n${literal(prompt, 2050)}\n\n`;
  const answerIntro = question + '**Hall’s answer**\n';
  const author = {
    name: clip(interaction.user.displayName, 256),
    iconURL: interaction.user.displayAvatarURL(),
  };
  const key = `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}:${interaction.ephemeral ? 'private' : 'public'}`;
  let answer: HallReply;
  try {
    answer = await hallai.ask(key, prompt, interaction.options.getBoolean('reset') || false);
  } catch (error) {
    if (!(error instanceof UserError)) safeLog('hallai_failed', error);
    await respond(interaction, [
      embed(
        'hallAI is unavailable',
        question +
          '**Status**\n' +
          (error instanceof UserError
            ? error.message
            : 'Your question could not be answered right now. Please try again shortly.' +
              (error instanceof HallFailure && error.reference
                ? `\nReference: ${error.reference}`
                : '')),
        'error',
      )
        .setAuthor(author)
        .setThumbnail(null),
    ]);
    return;
  }
  const text =
    answer.reply +
    (answer.truncated ? '\n\n*Hall reached its reply limit. Ask a follow-up to continue.*' : '');
  const status = [
    answer.webSearch ? 'Web search used' : '',
    answer.contextFresh ? 'Fresh context' : '',
    answer.safety === 'redirected'
      ? 'Safer direction'
      : answer.safety === 'support'
        ? 'Support'
        : answer.safety === 'checked'
          ? 'Safety checked'
          : '',
  ].filter(Boolean);
  const footer = {
    text: `CityMart Services • hallAI • v${VERSION}${status.length ? ' • ' + status.join(' • ') : ''}`,
  };
  let chunks: string[];
  try {
    chunks = splitAnswer(text, Math.min(3500, 4096 - answerIntro.length), 3500);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Some valid URLs exceed Discord's embed budget. Preserve the complete
    // answer in an attachment instead of silently cutting a citation in half.
    await interaction.editReply({
      ...message([
        embed(
          'hallAI’s answer',
          answerIntro + 'A source link is too long for an embed. The complete answer is attached.',
          'ai',
        )
          .setAuthor(author)
          .setThumbnail(null)
          .setFooter(footer),
      ]),
      files: [{ attachment: Buffer.from(text, 'utf8'), name: 'hall-answer.md' }],
    });
    return;
  }
  const answerEmbed = (text: string, index: number) =>
    embed(
      index ? `hallAI • continued (${index + 1}/${chunks.length})` : 'hallAI’s answer',
      index ? text : answerIntro + text,
      'ai',
    )
      .setAuthor(author)
      .setThumbnail(null)
      .setFooter(footer);
  await respond(interaction, [answerEmbed(chunks[0]!, 0)]);
  for (let index = 1; index < chunks.length; index++)
    await interaction.followUp({
      ...message([answerEmbed(chunks[index]!, index)]),
      flags: interaction.ephemeral ? MessageFlags.Ephemeral : undefined,
    });
}

export async function forget(interaction: ChatInputCommandInteraction, hallai: Hallai) {
  const scope = interaction.options.getBoolean('private') === true ? 'private' : 'public';
  const key = `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}:${scope}`;
  await hallai.forget(key);
  await respond(interaction, [
    embed(
      'Hall’s context cleared',
      `Your **${scope}** /ask conversation memory in this channel has been deleted. Your next question starts fresh. Existing Discord messages remain in the channel.`,
      'success',
    ).setThumbnail(null),
  ]);
}
