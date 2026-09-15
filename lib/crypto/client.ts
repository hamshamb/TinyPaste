import {
  AES_IV_BYTES,
  AES_KEY_LENGTH_BITS,
  AES_TAG_LENGTH_BITS,
  CURRENT_ENCRYPTION_VERSION,
  isSupportedEncryptionVersion,
} from './constants';
import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from './base64';

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  encryptionVersion: number;
};

export type EncryptionResult = EncryptedPayload & {
  /** base64url raw key. Belongs in the URL fragment and nowhere else. */
  key: string;
};

export class DecryptionError extends Error {
  readonly reason: 'unsupported-version' | 'invalid-key' | 'corrupt-payload';
  constructor(reason: DecryptionError['reason'], message: string) {
    super(message);
    this.name = 'DecryptionError';
    this.reason = reason;
  }
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('Web Crypto is unavailable in this environment.');
  return api;
}

/** Fresh 256-bit AES-GCM key. Extractable so it can be put in the fragment. */
export async function generateKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: AES_KEY_LENGTH_BITS }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await subtle().exportKey('raw', key));
  return bytesToBase64Url(raw);
}

export async function importKey(keyMaterial: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(keyMaterial);
  } catch {
    throw new DecryptionError('invalid-key', 'Unable to decrypt this paste.');
  }
  if (raw.length !== AES_KEY_LENGTH_BITS / 8) {
    throw new DecryptionError('invalid-key', 'Unable to decrypt this paste.');
  }
  try {
    return await subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  } catch {
    throw new DecryptionError('invalid-key', 'Unable to decrypt this paste.');
  }
}

/**
 * Encrypt plaintext in the browser. The returned key is never transmitted:
 * callers place it in the URL fragment, which user agents do not send to the
 * server.
 */
export async function encryptText(plaintext: string): Promise<EncryptionResult> {
  const key = await generateKey();
  const iv = new Uint8Array(AES_IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: AES_TAG_LENGTH_BITS },
    key,
    encoded as BufferSource,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
    encryptionVersion: CURRENT_ENCRYPTION_VERSION,
    key: await exportKey(key),
  };
}

/** Encrypt with an existing key — used when re-saving an edited encrypted paste. */
export async function encryptTextWithKey(plaintext: string, keyMaterial: string): Promise<EncryptedPayload> {
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(keyMaterial);
  } catch {
    throw new DecryptionError('invalid-key', 'Unable to use this encryption key.');
  }
  const key = await subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = new Uint8Array(AES_IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const cipherBuffer = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: AES_TAG_LENGTH_BITS },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
    encryptionVersion: CURRENT_ENCRYPTION_VERSION,
  };
}

/**
 * Decrypt a stored payload locally.
 *
 * AES-GCM is authenticated, so a wrong key and a tampered ciphertext both fail
 * the tag check and surface as the same generic error — that is deliberate.
 */
export async function decryptPayload(payload: EncryptedPayload, keyMaterial: string): Promise<string> {
  if (!isSupportedEncryptionVersion(payload.encryptionVersion)) {
    throw new DecryptionError('unsupported-version', 'This paste uses an unsupported encryption version.');
  }
  const key = await importKey(keyMaterial);

  let ciphertext: Uint8Array;
  let iv: Uint8Array;
  try {
    ciphertext = base64ToBytes(payload.ciphertext);
    iv = base64ToBytes(payload.iv);
  } catch {
    throw new DecryptionError('corrupt-payload', 'Unable to decrypt this paste.');
  }
  if (iv.length !== AES_IV_BYTES || ciphertext.length === 0) {
    throw new DecryptionError('corrupt-payload', 'Unable to decrypt this paste.');
  }

  let plainBuffer: ArrayBuffer;
  try {
    plainBuffer = await subtle().decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: AES_TAG_LENGTH_BITS },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new DecryptionError('invalid-key', 'Unable to decrypt this paste.');
  }
  return new TextDecoder().decode(plainBuffer);
}
