import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { UserError, safeLog } from '../core.js';
import { embed, links, respond, literal, clip, message, splitAnswer } from '../ui.js';
import type { Roblox, RobloxUser } from '../services/roblox.js';
import type { Easypos } from '../services/easypos.js';
import type { Minecraft } from '../services/minecraft.js';
import type { Hallai } from '../services/hallai.js';

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
  minecraft: Minecraft,
) {
  const command = interaction.commandName;
  if (command === 'minecraft') {
    const player = await minecraft.lookup(
      interaction.options.getString('username', true).trim(),
      interaction.user.id,
    );
    const result = embed(
      `${literal(player.name)} • Minecraft`,
      'Minecraft Java Edition player profile.',
      'minecraft',
    ).addFields(
      { name: 'Account', value: player.account, inline: true },
      { name: 'Skin model', value: player.model, inline: true },
      { name: 'Cape', value: player.capeUrl ? 'Available' : 'No cape found', inline: true },
    );
    if (player.skinUrl) result.setImage(player.skinUrl);
    return respond(
      interaction,
      [result],
      player.skinUrl || player.capeUrl
        ? [
            links(
              ...([
                player.skinUrl ? ['Open skin texture', player.skinUrl] : null,
                player.capeUrl ? ['Open cape texture', player.capeUrl] : null,
              ].filter(Boolean) as [string, string][]),
            ),
          ]
        : [],
    );
  }
  if (command === 'donationsleaderboard') {
    const entries = await easypos.leaderboard();
    const rows = await Promise.all(
      entries.map(async (entry, index) => {
        const user = await roblox.profile(entry.userId).catch(() => null);
        return `**${index + 1}.** [${literal(user?.name || `User ${entry.userId}`)}](${profileUrl(entry.userId)}) — **R$ ${entry.amount.toLocaleString()}**`;
      }),
    );
    return respond(interaction, [
      embed(
        'CityMart’s top donors',
        rows.join('\n') || 'No donations have been recorded yet.',
        'roblox',
      ),
    ]);
  }
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
  if (command === 'donations') {
    const amount = await easypos.donations(user.id);
    return respond(
      interaction,
      [
        profileEmbed(
          user,
          'CityMart donations',
          `Thank you for supporting CityMart!\n\n**Total donated: R$ ${amount.toLocaleString()}**`,
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
  const question = `**Your question**\n${literal(prompt, 2050)}\n\n**Hall’s answer**\n`;
  const author = {
    name: clip(interaction.user.displayName, 256),
    iconURL: interaction.user.displayAvatarURL(),
  };
  const key = `${interaction.guildId}:${interaction.channelId}:${interaction.user.id}:${interaction.ephemeral ? 'private' : 'public'}`;
  let answer: string;
  try {
    answer = await hallai.ask(key, prompt, interaction.options.getBoolean('reset') || false);
  } catch (error) {
    if (!(error instanceof UserError)) safeLog('hallai_failed', error);
    await respond(interaction, [
      embed(
        'hallAI is unavailable',
        question +
          (error instanceof UserError
            ? error.message
            : 'Your question could not be answered right now. Please try again shortly.'),
        'error',
      )
        .setAuthor(author)
        .setThumbnail(null),
    ]);
    return;
  }
  const chunks = splitAnswer(answer, Math.min(3500, 4096 - question.length));
  const answerEmbed = (text: string, index: number) =>
    embed(
      index ? `hallAI • continued (${index + 1}/${chunks.length})` : 'hallAI’s answer',
      index ? text : question + text,
      'ai',
    )
      .setAuthor(author)
      .setThumbnail(null);
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
