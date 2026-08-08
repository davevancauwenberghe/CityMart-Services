const test = require('node:test');
const assert = require('node:assert/strict');

const { decodeTextureProperty, isMinecraftUsername } = require('../utils/mojang');

test('validates Java Edition usernames without accepting UUIDs', () => {
  assert.equal(isMinecraftUsername('jeb_'), true);
  assert.equal(isMinecraftUsername('Player1234567890'), true);
  assert.equal(isMinecraftUsername('ab'), false);
  assert.equal(isMinecraftUsername('853c80ef3c3749fdaa49938b674adae6'), false);
  assert.equal(isMinecraftUsername('name-with-dash'), false);
});

test('decodes and secures Mojang texture metadata', () => {
  const value = Buffer.from(JSON.stringify({
    textures: {
      SKIN: {
        url: 'http://textures.minecraft.net/texture/skin-hash',
        metadata: { model: 'slim' }
      },
      CAPE: { url: 'https://textures.minecraft.net/texture/cape-hash' }
    }
  })).toString('base64');

  assert.deepEqual(decodeTextureProperty(value), {
    skinUrl: 'https://textures.minecraft.net/texture/skin-hash',
    capeUrl: 'https://textures.minecraft.net/texture/cape-hash',
    model: 'Slim (Alex)'
  });
});

test('rejects malformed and untrusted texture data', () => {
  assert.throws(() => decodeTextureProperty('not-base64-json'), /invalid texture/);

  const value = Buffer.from(JSON.stringify({
    textures: { SKIN: { url: 'https://example.com/not-a-mojang-texture' } }
  })).toString('base64');
  assert.equal(decodeTextureProperty(value).skinUrl, null);
});
