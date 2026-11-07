import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const N = 131072,
  r = 8,
  p = 1;
// Bound concurrent memory use and the waiting queue on the home server.
let busy = false;
const waiting = [];
async function lane(run) {
  if (busy) {
    if (waiting.length >= 8) throw Object.assign(new Error('busy'), { status: 429 });
    await new Promise((resolve) => waiting.push(resolve));
  }
  busy = true;
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else busy = false;
  }
}
const dummy = `scrypt$${N}$${r}$${p}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
export function validPassword(value) {
  return (
    typeof value === 'string' &&
    [...value].length >= 15 &&
    [...value].length <= 128 &&
    Buffer.byteLength(value) <= 512
  );
}
export function hashPassword(value) {
  return lane(async () => {
    const salt = randomBytes(16).toString('base64url');
    const key = await derive(value, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
    return `scrypt$${N}$${r}$${p}$${salt}$${key.toString('base64url')}`;
  });
}
export function verifyPassword(value, encoded = dummy) {
  return lane(async () => {
    const parts = encoded.split('$');
    if (
      parts.length !== 6 ||
      parts[0] !== 'scrypt' ||
      +parts[1] !== N ||
      +parts[2] !== r ||
      +parts[3] !== p
    )
      return false;
    const key = await derive(value, parts[4], 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
    const expected = Buffer.from(parts[5], 'base64url');
    return key.length === expected.length && timingSafeEqual(key, expected);
  });
}
