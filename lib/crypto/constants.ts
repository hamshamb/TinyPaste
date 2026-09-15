/**
 * Encryption format version. Bump when the algorithm, key derivation or payload
 * layout changes; stored alongside every ciphertext so old pastes stay readable.
 *
 * Version 1 = AES-GCM, 256-bit key, 96-bit random IV, raw key exported to the
 * URL fragment as base64url. No key derivation — the key itself is the secret.
 */
export const CURRENT_ENCRYPTION_VERSION = 1;
export const SUPPORTED_ENCRYPTION_VERSIONS = [1] as const;

export const AES_KEY_LENGTH_BITS = 256;
export const AES_IV_BYTES = 12;
export const AES_TAG_LENGTH_BITS = 128;

export function isSupportedEncryptionVersion(version: number): boolean {
  return (SUPPORTED_ENCRYPTION_VERSIONS as readonly number[]).includes(version);
}
