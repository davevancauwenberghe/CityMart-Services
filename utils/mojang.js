'use strict';

const MINECRAFT_USERNAME = /^[A-Za-z0-9_]{3,16}$/;

function isMinecraftUsername(value) {
  return typeof value === 'string' && MINECRAFT_USERNAME.test(value);
}

function decodeTextureProperty(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Mojang returned an empty texture property');
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    throw new Error('Mojang returned an invalid texture property');
  }

  const textures = decoded?.textures;
  if (!textures || typeof textures !== 'object') return {};

  return {
    skinUrl: normaliseTextureUrl(textures.SKIN?.url),
    capeUrl: normaliseTextureUrl(textures.CAPE?.url),
    model: textures.SKIN?.metadata?.model === 'slim' ? 'Slim (Alex)' : 'Classic (Steve)'
  };
}

function normaliseTextureUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value);
    if (url.hostname !== 'textures.minecraft.net') return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

module.exports = { decodeTextureProperty, isMinecraftUsername };
