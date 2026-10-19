import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { CitycraftStatus, pingJavaServer } from '../src/services/citycraft-status.js';

function int(value: number) {
  const bytes: number[] = [];
  do {
    const next = value & 127;
    value >>>= 7;
    bytes.push(next | (value ? 128 : 0));
  } while (value);
  return Buffer.from(bytes);
}
const frame = (value: Buffer) => Buffer.concat([int(value.length), value]);
const info = {
  version: { name: 'Paper 1.21 · Café', protocol: 767 },
  players: { online: 3, max: 20, sample: [{ name: 'PRIVATE_PLAYER' }] },
  description: 'PRIVATE_MOTD',
};
function status(value: unknown = info) {
  const json = Buffer.from(JSON.stringify(value));
  return frame(Buffer.concat([Buffer.from([0]), int(json.length), json]));
}
async function server(
  t: { after: (fn: () => Promise<void>) => void },
  connection: (socket: Socket) => void,
) {
  const sockets = new Set<Socket>();
  const listener = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    connection(socket);
  });
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = (listener.address() as { port: number }).port;
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });
  return { host: '127.0.0.1', port, address: 'citycraft.test' };
}
function packets(socket: Socket, receive: (packet: Buffer, index: number) => void) {
  let data: Buffer = Buffer.alloc(0),
    index = 0;
  socket.on('data', (chunk: Buffer) => {
    data = Buffer.concat([data, chunk]);
    while (data.length) {
      let length = 0,
        bytes = 0;
      for (; bytes < data.length; bytes++) {
        const byte = data[bytes]!;
        length += (byte & 127) * 2 ** (bytes * 7);
        if (!(byte & 128)) break;
      }
      if (bytes === data.length || data.length < bytes + 1 + length) return;
      const packet = data.subarray(bytes + 1, bytes + 1 + length);
      data = data.subarray(bytes + 1 + length);
      receive(packet, index++);
    }
  });
}

test('native Minecraft status handles fragmented Unicode JSON and verifies the ping echo without exposing player names', async (t) => {
  const target = await server(t, (socket) =>
    packets(socket, (packet, index) => {
      if (!index) {
        assert.deepEqual([...packet.subarray(0, 6)], [0, 255, 255, 255, 255, 15]);
        assert.ok(packet.includes(Buffer.from('citycraft.test')));
        assert.equal(packet.at(-1), 1);
      } else if (index === 1) {
        assert.deepEqual(packet, Buffer.from([0]));
        const response = status();
        socket.write(response.subarray(0, 1));
        setImmediate(() => {
          socket.write(response.subarray(1, 10));
          setImmediate(() => socket.write(response.subarray(10)));
        });
      } else {
        assert.equal(packet[0], 1);
        assert.equal(packet.length, 9);
        socket.end(frame(packet));
      }
    }),
  );
  const result = await pingJavaServer(target);
  assert.equal(result.state, 'online');
  assert.deepEqual(result.players, { online: 3, max: 20 });
  assert.equal(result.version, 'Paper 1.21 · Café');
  assert.ok(Number.isInteger(result.latencyMs));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PLAYER|PRIVATE_MOTD/);
});

test('a valid status response still reports online when the server closes without pong', async (t) => {
  const target = await server(t, (socket) =>
    packets(socket, (_packet, index) => {
      if (index === 1) socket.end(status());
    }),
  );
  const result = await pingJavaServer(target);
  assert.equal(result.state, 'online');
  assert.equal(result.latencyMs, undefined);
});

test('open TCP ports, malformed/oversized frames and invalid status objects cannot report a Minecraft server online', async (t) => {
  for (const response of [
    Buffer.from([0]),
    Buffer.from([255, 255, 255, 255, 255]),
    int(65_537),
    status({}),
    frame(Buffer.from([1, 0])),
    frame(Buffer.from([0, 2, 0x7b, 0xff])),
  ]) {
    const target = await server(t, (socket) => {
      socket.end(response);
    });
    assert.notEqual((await pingJavaServer(target, 100)).state, 'online');
  }
});

test('idle sockets have a total deadline and concurrent/cached status checks share one probe', async (t) => {
  const target = await server(t, () => {});
  const started = Date.now();
  const result = await pingJavaServer(target, 50);
  assert.equal(result.state, 'unreachable');
  assert.ok(Date.now() - started < 1500);
  let probes = 0;
  const service = new CitycraftStatus(target, async () => {
    probes++;
    return result;
  });
  assert.deepEqual(await Promise.all([service.check(), service.check(), service.check()]), [
    result,
    result,
    result,
  ]);
  await service.check();
  assert.equal(probes, 1);
});
