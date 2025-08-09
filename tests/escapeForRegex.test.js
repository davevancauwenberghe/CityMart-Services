const test = require('node:test');
const assert = require('node:assert');
const escapeForRegex = require('../utils/escapeForRegex');

test('escapes special characters with single backslash', () => {
  assert.strictEqual(escapeForRegex('+'), '\\+');
  assert.strictEqual(escapeForRegex('*'), '\\*');
});
