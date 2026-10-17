import { DateTime } from 'luxon';
import { UserError } from '../core.js';
export function giveawayEnd(
  duration: string | null,
  end: string | null,
  zone: string,
  now = Date.now(),
): number {
  if (Boolean(duration) === Boolean(end))
    throw new UserError(
      'Choose either a duration (for example 2h or 7d) or an end date, using exactly one option.',
    );
  let endAt: number;
  if (duration) {
    const match = /^(\d{1,4})(m|h|d)$/i.exec(duration.trim());
    if (!match) throw new UserError('Use a duration such as 30m, 2h or 7d.');
    endAt =
      now +
      Number(match[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]!.toLowerCase()] || 0);
  } else {
    const date = DateTime.fromFormat(end!, 'yyyy-MM-dd HH:mm', { zone, setZone: true });
    if (
      !date.isValid ||
      date.toFormat('yyyy-MM-dd HH:mm') !== end ||
      date.getPossibleOffsets().length !== 1
    )
      throw new UserError(
        `Use a valid, unambiguous date in ${zone}: YYYY-MM-DD HH:mm. During a daylight-saving clock change, use a duration instead.`,
      );
    endAt = date.toMillis();
  }
  if (endAt < now + 60_000 || endAt > now + 90 * 86_400_000)
    throw new UserError('Giveaways must last between 1 minute and 90 days.');
  return endAt;
}
