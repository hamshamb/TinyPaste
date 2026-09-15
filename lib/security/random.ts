import { webcrypto } from 'node:crypto';

/**
 * Cryptographically secure random bytes. Uses the Web Crypto API so the same
 * code path works under the Node.js and Edge runtimes. Never Math.random.
 */
export function randomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  const cryptoApi: Crypto = globalThis.crypto ?? (webcrypto as unknown as Crypto);
  cryptoApi.getRandomValues(buffer);
  return buffer;
}

/** URL-safe base64 without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomBase64Url(byteLength: number): string {
  return toBase64Url(randomBytes(byteLength));
}
