import crypto from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';

// Argon2id with OWASP-recommended parameters (m=19MiB, t=2, p=1).
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain) => argon2.hash(plain, ARGON_OPTS);

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Pre-computed hash used to equalise timing when a login email does not exist.
let dummyHash;
export async function burnPasswordCheck(plain) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(dummyHash, plain);
  return false;
}

/** Cryptographically random URL-safe token (default 256 bits). */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Tokens are stored only as SHA-256 hashes so a DB leak does not leak live sessions/reset links. */
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const hmac = (value) => crypto.createHmac('sha256', env.AUTH_SECRET).update(value).digest('base64url');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
