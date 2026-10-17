import { Cache, ServiceError, UserError, object, textValue, numberValue } from '../core.js';
import type { Config } from '../config.js';
import type { HttpClient } from './http.js';

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  description: string;
  created: string;
  avatar: string | null;
}
export class Roblox {
  private usernames = new Cache<RobloxUser | null>(300_000);
  private profiles = new Cache<RobloxUser>(300_000);
  private roles = new Cache<{ name: string; rank: number } | null>(60_000);
  private counts = new Cache<number>(60_000, 1);
  constructor(
    private readonly http: HttpClient,
    private readonly config: Config,
  ) {}
  async lookup(username: string): Promise<RobloxUser> {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      throw new UserError(
        'Enter a Roblox username with 3–20 letters, numbers or underscores. Display names cannot be used.',
      );
    const result = await this.usernames.get(username.toLowerCase(), async () => {
      const result = object(
        await this.http.json('Roblox', 'https://users.roblox.com/v1/usernames/users', {
          usernames: [username],
          excludeBannedUsers: false,
        }),
      );
      if (!Array.isArray(result.data)) throw new ServiceError('Roblox');
      const id = numberValue(object(result.data[0]).id);
      if (!id) return null;
      return this.profile(id);
    });
    if (!result)
      throw new UserError(
        'That Roblox username could not be found. Check the spelling and try again.',
      );
    return result;
  }
  profile(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ServiceError('Roblox');
    return this.profiles.get(String(id), async () => {
      const profile = object(
        await this.http.json('Roblox', `https://users.roblox.com/v1/users/${id}`),
      );
      if (profile.id !== id || typeof profile.name !== 'string') throw new ServiceError('Roblox');
      let avatar: string | null = null;
      try {
        const thumbnails = object(
          await this.http.json(
            'Roblox',
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=true`,
          ),
        );
        const value = object(Array.isArray(thumbnails.data) ? thumbnails.data[0] : null).imageUrl;
        if (typeof value === 'string' && /^https:\/\//.test(value)) avatar = value;
      } catch {
        /* Profile details remain useful when thumbnails are unavailable. */
      }
      return {
        id,
        name: profile.name,
        displayName: textValue(profile.displayName, profile.name),
        description: textValue(profile.description, 'No profile description.'),
        created: textValue(profile.created, ''),
        avatar,
      };
    });
  }
  role(id: number) {
    return this.roles.get(String(id), async () => {
      const result = object(
        await this.http.json('Roblox', `https://groups.roblox.com/v1/users/${id}/groups/roles`),
      );
      if (!Array.isArray(result.data)) throw new ServiceError('Roblox');
      const group = result.data
        .map(object)
        .find((item) => object(item.group).id === Number(this.config.groupId));
      if (!group) return null;
      const role = object(group.role);
      if (typeof role.name !== 'string' || numberValue(role.rank) === null)
        throw new ServiceError('Roblox');
      return { name: role.name, rank: role.rank as number };
    });
  }
  count() {
    return this.counts.get(this.config.groupId, async () => {
      const result = object(
        await this.http.json(
          'Roblox',
          `https://groups.roblox.com/v1/groups/${this.config.groupId}`,
        ),
      );
      const count = numberValue(result.memberCount);
      if (count === null) throw new ServiceError('Roblox');
      return count;
    });
  }
}
