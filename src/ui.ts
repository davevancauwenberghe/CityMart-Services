import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  escapeMarkdown,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type InteractionReplyOptions,
} from 'discord.js';
import { VERSION } from './config.js';
import { UserError } from './core.js';

export const BRAND_ICON =
  'https://storage.davevancauwenberghe.be/citymart/visuals/citymart_group_icon.png';
export type Category =
  'info' | 'success' | 'warning' | 'error' | 'roblox' | 'minecraft' | 'giveaway' | 'ai';
const colors: Record<Category, number> = {
  info: 0x5865f2,
  success: 0x2ecc71,
  warning: 0xf1c40f,
  error: 0xe74c3c,
  roblox: 0x00a2ff,
  minecraft: 0x59a341,
  giveaway: 0xeb459e,
  ai: 0x9b59b6,
};
export const clip = (value: string, length: number) =>
  value.length <= length ? value : value.slice(0, length - 1) + '…';
export const literal = (value: string, length = 1000) =>
  clip(
    escapeMarkdown(value).replace(/@/g, '@\u200b').replace(/</g, '‹').replace(/>/g, '›'),
    length,
  );
export function embed(title: string, description: string, category: Category = 'info') {
  return new EmbedBuilder()
    .setColor(colors[category])
    .setTitle(clip(title, 256))
    .setDescription(clip(description, 4096))
    .setThumbnail(BRAND_ICON)
    .setFooter({
      text: `CityMart Services • ${category === 'ai' ? 'hallAI' : category} • v${VERSION}`,
    })
    .setTimestamp();
}
export function links(...items: [string, string][]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    items.map(([label, url]) =>
      new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link),
    ),
  );
}
export const message = (
  embeds: EmbedBuilder[],
  components: InteractionReplyOptions['components'] = [],
) => ({ embeds, components, allowedMentions: { parse: [] as const } });
export type ReplyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;
export async function defer(interaction: ReplyInteraction, privateReply = true) {
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
}
export async function respond(
  interaction: ReplyInteraction,
  embeds: EmbedBuilder[],
  components: InteractionReplyOptions['components'] = [],
  privateReply = true,
) {
  const payload = message(embeds, components);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({
    ...payload,
    ...(privateReply ? { flags: MessageFlags.Ephemeral } : {}),
  });
}
export async function respondError(interaction: ReplyInteraction, error: unknown) {
  const description =
    error instanceof UserError
      ? error.message
      : 'The request could not be completed. Please try again shortly. If it keeps happening, contact the server owner.';
  await respond(interaction, [
    embed(
      'Unable to complete request',
      description,
      error instanceof UserError ? 'warning' : 'error',
    ),
  ]);
}
/** Preserve complete source links, Unicode and code fences across embed boundaries. */
export function splitAnswer(value: string, max = 3500, continuedMax = max): string[] {
  if (
    ![max, continuedMax].every((limit) => Number.isInteger(limit) && limit >= 128 && limit <= 4096)
  )
    throw new RangeError('Invalid embed chunk size.');
  // An inline citation can contain balanced or escaped URL parentheses. Scan
  // through its outer delimiter before considering raw URLs outside the link.
  const tokens = /\[(?:\\[^\r\n]|[^\]\\\r\n]){1,200}\]\(<?https?:\/\/|https?:\/\/[^\s<>]+/g;
  const protectedSpans: { start: number; end: number }[] = [];
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(value))) {
    if (token[0].startsWith('[')) {
      let depth = 1;
      let end = tokens.lastIndex;
      let angleDestination = /\]\(<https?:\/\/$/.test(token[0]);
      for (; end < value.length; end++) {
        const character = value[end]!;
        if (/\s/.test(character)) break;
        if (character === '\\')
          end++; // Escaped delimiters do not affect balance.
        else if (angleDestination) {
          if (character === '>') angleDestination = false;
        } else if (character === '(') depth++;
        else if (character === ')' && --depth === 0) break;
      }
      if (depth === 0) {
        protectedSpans.push({ start: token.index, end: end + 1 });
        tokens.lastIndex = end + 1;
      } else {
        // Incomplete Markdown still gets the ordinary URL protection below.
        tokens.lastIndex = token.index + token[0].lastIndexOf('http');
      }
    } else protectedSpans.push({ start: token.index, end: tokens.lastIndex });
  }
  const chunks: string[] = [];
  let remaining = value;
  let fence = '';
  let offset = 0;
  while (remaining.length) {
    const prefix = fence ? `\`\`\`${fence}\n` : '';
    const limit = (chunks.length ? continuedMax : max) - prefix.length - 6;
    let end = Math.min(limit, remaining.length);
    if (end < remaining.length) {
      const newline = remaining.lastIndexOf('\n', end);
      if (newline > limit / 2) end = newline + 1;
      if (/^[\uDC00-\uDFFF]$/.test(remaining[end] || '')) end--;
    }
    const crossing = protectedSpans.find(
      (span) => span.start < offset + end && span.end > offset + end,
    );
    if (crossing) {
      if (crossing.start > offset) end = crossing.start - offset;
      else if (!chunks.length && continuedMax > max) {
        chunks.push('The answer continues below.');
        continue;
      } else throw new RangeError('A source link is too long for an embed.');
    }
    const part = remaining.slice(0, end);
    for (const match of part.matchAll(/^```([^\n`]*)/gm)) {
      const language = match[1]?.trim() || '';
      fence = fence ? '' : /^[\w#+.-]{1,32}$/.test(language) ? language : 'text';
    }
    chunks.push(prefix + part + (fence ? '\n```' : ''));
    remaining = remaining.slice(end);
    offset += end;
  }
  return chunks.length ? chunks : ['No response was returned.'];
}
