import { createHash, timingSafeEqual } from 'node:crypto';
import { EDIT_TOKEN_BYTES } from '@/lib/config/constants';
import { randomBase64Url } from './random';

/**
 * Edit tokens are 256-bit random values, so they are not guessable and not
 * subject to dictionary attack. A single SHA-256 is therefore the right
 * primitive for storage: it removes the plaintext from the database without the
 * per-request cost of a password KDF (unlike user-chosen passwords, which use
 * bcrypt — see lib/security/password.ts).
 */
export function generateEditToken(): string {
  return randomBase64Url(EDIT_TOKEN_BYTES);
}

export function hashEditToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compare a presented token against a stored hash in constant time so response
 * timing cannot be used to recover a token byte by byte.
 */
export function verifyEditToken(token: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!token || !storedHash) return false;
  const presented = Buffer.from(hashEditToken(token), 'hex');
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (presented.length !== stored.length || stored.length === 0) return false;
  return timingSafeEqual(presented, stored);
}
