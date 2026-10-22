import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs, {
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  truncate,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GiveawayStore } from '../src/giveaways/store.js';

const maxBytes = 20 * 1024 * 1024;
const emptyDocument = JSON.stringify({ schema: 2, giveaways: {} });

async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'citymart-store-loading-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new GiveawayStore(join(dir, 'giveaways.json'));
  await writeFile(store.file, emptyDocument);
  return store;
}

async function afterSizeCheck(t: TestContext, file: string, change: () => Promise<void>) {
  let changed = false;
  const changeOnce = async () => {
    if (changed) return;
    changed = true;
    await change();
  };
  // Cover both pathname and descriptor checks so the original reader exercises the same race.
  const originalPathStat = fs.stat;
  const pathStat = t.mock.method(fs, 'stat', async (...args: Parameters<typeof fs.stat>) => {
    const result = await originalPathStat(...args);
    if (args[0] === file) await changeOnce();
    return result;
  });
  syncBuiltinESMExports();
  t.after(() => {
    pathStat.mock.restore();
    syncBuiltinESMExports();
  });
  const probe = await open(file, 'r');
  const prototype = Object.getPrototypeOf(probe) as FileHandle;
  await probe.close();
  const original = prototype.stat;
  t.mock.method(
    prototype,
    'stat',
    async function (this: FileHandle) {
      const result = await original.call(this);
      await changeOnce();
      return result;
    },
    { times: 1 },
  );
}

test('loading reads the checked file even if its pathname is replaced', async (t) => {
  const store = await setup(t);
  await afterSizeCheck(t, store.file, async () => {
    await rename(store.file, store.file + '.original');
    await writeFile(store.file, '{invalid replacement');
  });
  await store.load();
  assert.deepEqual(store.list(), []);
  assert.equal(await readFile(store.file, 'utf8'), '{invalid replacement');
});

test('loading accepts valid JSON exactly at the 20 MiB byte limit', async (t) => {
  const store = await setup(t);
  await writeFile(store.file, emptyDocument.padEnd(maxBytes, ' '));
  await store.load();
  assert.deepEqual(store.list(), []);
});

test('loading rejects an oversized file without replacing it', async (t) => {
  const store = await setup(t);
  await truncate(store.file, maxBytes + 1);
  await assert.rejects(store.load(), /Giveaway file exceeds 20 MiB/);
  const handle = await open(store.file, 'r');
  try {
    assert.equal((await handle.stat()).size, maxBytes + 1);
  } finally {
    await handle.close();
  }
});

test('loading rejects a file that grows beyond the limit after the size check', async (t) => {
  const store = await setup(t);
  await afterSizeCheck(t, store.file, async () => {
    await writeFile(store.file, emptyDocument.padEnd(maxBytes + 1, ' '));
  });
  await assert.rejects(store.load(), /Giveaway file exceeds 20 MiB/);
});
