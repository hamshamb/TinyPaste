import { SLUG_ALPHABET, SLUG_LENGTH, SLUG_PATTERN } from '@/lib/config/constants';
import { randomBytes } from '@/lib/security/random';

/**
 * Generate a public slug from cryptographically secure randomness.
 *
 * Rejection sampling keeps the distribution uniform: bytes at or above the
 * largest multiple of the alphabet length are discarded rather than folded with
 * a modulo, which would otherwise bias the first few symbols.
 */
export function generateSlug(length: number = SLUG_LENGTH): string {
  const alphabet = SLUG_ALPHABET;
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Slugs arrive from URLs, so validate before they reach the database layer. */
export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}
