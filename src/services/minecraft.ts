import { Cache, RateLimit, UserError, ServiceError, object, textValue } from '../core.js';
import type { HttpClient } from './http.js';
export const isMinecraftUsername = (value: string) => /^[A-Za-z0-9_]{3,16}$/.test(value);
export function normaliseTextureUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.hostname !== 'textures.minecraft.net' ||
      url.username ||
      url.password ||
      url.port ||
      !url.pathname.startsWith('/texture/')
    )
      return null;
    url.protocol = 'https:';
    return url.href;
  } catch {
    return null;
  }
}
export function decodeTextureProperty(value: string) {
  try {
    const textures = object(
      object(JSON.parse(Buffer.from(value, 'base64').toString('utf8'))).textures,
    );
    return {
      skinUrl: normaliseTextureUrl(object(textures.SKIN).url),
      capeUrl: normaliseTextureUrl(object(textures.CAPE).url),
      model:
        object(object(textures.SKIN).metadata).model === 'slim' ? 'Slim (Alex)' : 'Classic (Steve)',
    };
  } catch {
    throw new ServiceError('Mojang');
  }
}
interface Player {
  name: string;
  account: string;
  skinUrl: string | null;
  capeUrl: string | null;
  model: string;
}
export class Minecraft {
  private cache = new Cache<Player | null>(300_000);
  private users = new RateLimit(3, 60_000);
  private upstream = new RateLimit(180, 120_000);
  constructor(private readonly http: HttpClient) {}
  async lookup(username: string, actor: string) {
    if (!isMinecraftUsername(username))
      throw new UserError(
        'Enter a Java Edition username with 3–16 letters, numbers or underscores. UUID lookup is not available.',
      );
    this.users.take(actor);
    const result = await this.cache.get(username.toLowerCase(), async () => {
      this.upstream.take('mojang', 2);
      const response = await this.http.request(
        'Mojang',
        `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`,
      );
      if ([204, 404].includes(response.status)) return null;
      if (response.status !== 200) throw new ServiceError('Mojang', response.status);
      let profile: Record<string, unknown>;
      try {
        profile = object(JSON.parse(response.text));
      } catch {
        throw new ServiceError('Mojang');
      }
      if (typeof profile.id !== 'string' || !/^[a-f0-9]{32}$/i.test(profile.id))
        throw new ServiceError('Mojang');
      const session = object(
        await this.http.json(
          'Mojang',
          `https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`,
        ),
      );
      const texture = (Array.isArray(session.properties) ? session.properties : [])
        .map(object)
        .find((property) => property.name === 'textures');
      return {
        name: textValue(profile.name, username),
        account: profile.demo ? 'Demo' : profile.legacy ? 'Legacy Java Edition' : 'Java Edition',
        ...(typeof texture?.value === 'string'
          ? decodeTextureProperty(texture.value)
          : { skinUrl: null, capeUrl: null, model: 'Not available' }),
      };
    });
    if (!result)
      throw new UserError(
        'That Minecraft Java player could not be found. Check the username and try again.',
      );
    return result;
  }
}
