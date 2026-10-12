import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;

// Stored format: "<salt>:<hash>", both hex.
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex'); // new random salt every time
  const hash = (await scrypt(password, salt, KEYLEN)).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt, KEYLEN);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}