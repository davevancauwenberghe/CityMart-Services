import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { Cache, object } from '../core.js';

export interface ServerStatus {
  state: 'online' | 'unreachable' | 'unavailable';
  checkedAt: number;
  players?: { online: number; max: number };
  version?: string;
  latencyMs?: number;
}
interface Target {
  host: string;
  port: number;
  address?: string;
}
const MAX_PACKET = 65_536;

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let n = value >>> 0;
  do {
    let byte = n & 127;
    n >>>= 7;
    if (n) byte |= 128;
    bytes.push(byte);
  } while (n);
  return Buffer.from(bytes);
}
function readVarint(buffer: Buffer, offset = 0): { value: number; bytes: number } | undefined {
  let value = 0;
  for (let index = 0; index < 5; index++) {
    const byte = buffer[offset + index];
    if (byte === undefined) return undefined;
    if (index === 4 && byte & 0xf0) throw new Error('Invalid VarInt');
    value += (byte & 127) * 2 ** (index * 7);
    if (!(byte & 128)) return { value, bytes: index + 1 };
  }
  throw new Error('Invalid VarInt');
}
function packet(payload: Buffer): Buffer {
  return Buffer.concat([varint(payload.length), payload]);
}

/** Java Server List Ping only: no login, player enumeration, UDP query or RCON. */
export async function pingJavaServer(target: Target, timeoutMs = 4000): Promise<ServerStatus> {
  return new Promise((resolve) => {
    let buffer: Buffer = Buffer.alloc(0),
      received = 0,
      settled = false;
    let status: ServerStatus | undefined,
      pingStarted = 0;
    const nonce = randomBytes(8);
    const socket = createConnection({ host: target.host, port: target.port });
    const finish = (state: ServerStatus['state']) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(status || { state, checkedAt: Date.now() });
    };
    // A total deadline also bounds DNS/connect time and slow trickle responses.
    const timer = setTimeout(() => finish('unreachable'), timeoutMs);
    socket.on('error', () => finish('unreachable'));
    socket.on('end', () => finish('unavailable'));
    socket.on('close', () => finish('unavailable'));
    socket.on('connect', () => {
      const address = Buffer.from((target.address || target.host).slice(0, 255));
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      // Protocol -1 requests status without claiming compatibility with a game version.
      socket.write(
        Buffer.concat([
          packet(
            Buffer.concat([
              varint(0),
              varint(-1),
              varint(address.length),
              address,
              port,
              varint(1),
            ]),
          ),
          packet(Buffer.from([0])),
        ]),
      );
    });
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      try {
        received += chunk.length;
        if (received > MAX_PACKET + 32) throw new Error('Response too large');
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
          const length = readVarint(buffer);
          if (!length) return;
          if (length.value < 1 || length.value > MAX_PACKET)
            throw new Error('Invalid packet length');
          if (buffer.length < length.bytes + length.value) return;
          const payload = buffer.subarray(length.bytes, length.bytes + length.value);
          buffer = buffer.subarray(length.bytes + length.value);
          const id = readVarint(payload);
          if (!id) throw new Error('Missing packet ID');
          if (!status) {
            if (id.value !== 0) throw new Error('Unexpected status packet');
            const string = readVarint(payload, id.bytes);
            if (
              !string ||
              string.value < 2 ||
              id.bytes + string.bytes + string.value !== payload.length
            )
              throw new Error('Invalid status string');
            const value = object(
              JSON.parse(
                new TextDecoder('utf-8', { fatal: true }).decode(
                  payload.subarray(id.bytes + string.bytes),
                ),
              ),
            );
            const version = object(value.version),
              players = object(value.players);
            if (
              typeof version.name !== 'string' ||
              !Number.isInteger(version.protocol) ||
              !Number.isInteger(players.online) ||
              !Number.isInteger(players.max) ||
              (players.online as number) < 0 ||
              (players.max as number) < 0
            )
              throw new Error('Invalid Minecraft status');
            status = {
              state: 'online',
              checkedAt: Date.now(),
              version: version.name.replace(/[\p{C}]/gu, '').slice(0, 100),
              players: { online: players.online as number, max: players.max as number },
            };
            pingStarted = performance.now();
            socket.write(packet(Buffer.concat([varint(1), nonce])));
          } else {
            if (
              id.value !== 1 ||
              payload.length !== id.bytes + 8 ||
              !payload.subarray(id.bytes).equals(nonce)
            )
              throw new Error('Invalid ping response');
            status.latencyMs = Math.max(0, Math.round(performance.now() - pingStarted));
            finish('online');
            return;
          }
        }
      } catch {
        finish('unavailable');
      }
    });
  });
}

export class CitycraftStatus {
  private readonly cache = new Cache<ServerStatus>(20_000, 1);
  constructor(
    private readonly target: Target,
    private readonly ping = pingJavaServer,
  ) {}
  check(): Promise<ServerStatus> {
    return this.cache.get('citycraft', () => this.ping(this.target));
  }
}
