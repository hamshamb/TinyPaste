import bcrypt from 'bcryptjs';
import { PASSWORD_HASH_ROUNDS } from '@/lib/config/constants';

/**
 * Paste passwords are user-chosen and therefore low entropy, so they need a
 * deliberately slow KDF. bcrypt is used rather than Argon2 because it is pure
 * JavaScript: it runs unchanged on Vercel's serverless runtime with no native
 * build step. See docs/SECURITY.md for the trade-off.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

/**
 * Verify a password against a stored hash. Returns false (never throws) for
 * malformed hashes so callers cannot distinguish "bad hash" from "bad password".
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
