import { describe, expect, it } from 'vitest';
import {
  DecryptionError,
  decryptPayload,
  encryptText,
  encryptTextWithKey,
} from '@/lib/crypto/client';
import { base64ToBytes, base64UrlToBytes, bytesToBase64 } from '@/lib/crypto/base64';
import { buildFragment, buildShareUrl, readKeyFromHash } from '@/lib/crypto/fragment';
import { AES_IV_BYTES, CURRENT_ENCRYPTION_VERSION } from '@/lib/crypto/constants';
import { parseDocumentJson } from '@/lib/document/schema';
import { docToPlainText } from '@/lib/document/plain-text';

const PLAINTEXT = 'const secret = "hunter2";\nconsole.log(secret); // 🔐 ünïcode';

describe('encryptText', () => {
  it('round-trips through decryptPayload', async () => {
    const result = await encryptText(PLAINTEXT);
    expect(await decryptPayload(result, result.key)).toBe(PLAINTEXT);
  });

  it('stamps the current encryption version', async () => {
    const result = await encryptText('x');
    expect(result.encryptionVersion).toBe(CURRENT_ENCRYPTION_VERSION);
  });

  it('never returns the plaintext in the stored payload', async () => {
    const result = await encryptText(PLAINTEXT);
    expect(result.ciphertext).not.toContain('hunter2');
    expect(result.ciphertext).not.toBe(PLAINTEXT);
    // The ciphertext is longer than the plaintext by the 16-byte GCM tag.
    expect(base64ToBytes(result.ciphertext).length).toBe(
      new TextEncoder().encode(PLAINTEXT).length + 16,
    );
  });

  it('uses a 96-bit IV', async () => {
    const result = await encryptText('x');
    expect(base64ToBytes(result.iv).length).toBe(AES_IV_BYTES);
  });

  it('exports a 256-bit key', async () => {
    const result = await encryptText('x');
    expect(base64UrlToBytes(result.key).length).toBe(32);
  });

  it('produces a fresh key and IV for every paste', async () => {
    const a = await encryptText(PLAINTEXT);
    const b = await encryptText(PLAINTEXT);
    expect(a.key).not.toBe(b.key);
    expect(a.iv).not.toBe(b.iv);
    // Identical plaintext must not produce identical ciphertext.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('handles empty and large inputs', async () => {
    const empty = await encryptText('');
    expect(await decryptPayload(empty, empty.key)).toBe('');

    const large = 'a'.repeat(200_000);
    const encrypted = await encryptText(large);
    expect(await decryptPayload(encrypted, encrypted.key)).toBe(large);
  });
});

describe('decryptPayload', () => {
  it('rejects a different key', async () => {
    const result = await encryptText(PLAINTEXT);
    const other = await encryptText('unrelated');
    await expect(decryptPayload(result, other.key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a malformed key', async () => {
    const result = await encryptText(PLAINTEXT);
    await expect(decryptPayload(result, 'not-a-key')).rejects.toMatchObject({ reason: 'invalid-key' });
  });

  it('rejects a key of the wrong length', async () => {
    const result = await encryptText(PLAINTEXT);
    await expect(decryptPayload(result, result.key.slice(0, 20))).rejects.toMatchObject({
      reason: 'invalid-key',
    });
  });

  it('rejects a tampered ciphertext', async () => {
    const result = await encryptText(PLAINTEXT);
    const bytes = base64ToBytes(result.ciphertext);
    // Flip one bit: AES-GCM's authentication tag must catch it.
    bytes[0] = (bytes[0]! ^ 0x01) & 0xff;
    await expect(
      decryptPayload({ ...result, ciphertext: bytesToBase64(bytes) }, result.key),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a tampered IV', async () => {
    const result = await encryptText(PLAINTEXT);
    const iv = base64ToBytes(result.iv);
    iv[0] = (iv[0]! ^ 0xff) & 0xff;
    await expect(
      decryptPayload({ ...result, iv: bytesToBase64(iv) }, result.key),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a truncated ciphertext', async () => {
    const result = await encryptText(PLAINTEXT);
    const bytes = base64ToBytes(result.ciphertext).slice(0, 8);
    await expect(
      decryptPayload({ ...result, ciphertext: bytesToBase64(bytes) }, result.key),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects an empty ciphertext as corrupt', async () => {
    const result = await encryptText(PLAINTEXT);
    await expect(decryptPayload({ ...result, ciphertext: '' }, result.key)).rejects.toMatchObject({
      reason: 'corrupt-payload',
    });
  });

  it('rejects an IV of the wrong length', async () => {
    const result = await encryptText(PLAINTEXT);
    await expect(
      decryptPayload({ ...result, iv: bytesToBase64(new Uint8Array(8)) }, result.key),
    ).rejects.toMatchObject({ reason: 'corrupt-payload' });
  });

  it('rejects an unsupported encryption version', async () => {
    const result = await encryptText(PLAINTEXT);
    await expect(decryptPayload({ ...result, encryptionVersion: 99 }, result.key)).rejects.toMatchObject({
      reason: 'unsupported-version',
    });
  });

  it('surfaces the same generic message for a wrong key and a corrupt payload', async () => {
    const result = await encryptText(PLAINTEXT);
    const other = await encryptText('unrelated');
    const bytes = base64ToBytes(result.ciphertext);
    bytes[1] = (bytes[1]! ^ 0x80) & 0xff;

    const wrongKey = await decryptPayload(result, other.key).catch((error: DecryptionError) => error.message);
    const corrupt = await decryptPayload({ ...result, ciphertext: bytesToBase64(bytes) }, result.key).catch(
      (error: DecryptionError) => error.message,
    );
    expect(wrongKey).toBe(corrupt);
  });
});

describe('encryptTextWithKey', () => {
  it('re-encrypts with an existing key and a fresh IV', async () => {
    const original = await encryptText(PLAINTEXT);
    const updated = await encryptTextWithKey('updated content', original.key);

    expect(updated.iv).not.toBe(original.iv);
    expect(await decryptPayload(updated, original.key)).toBe('updated content');
  });

  it('rejects a malformed key', async () => {
    await expect(encryptTextWithKey('x', '!!!not base64!!!')).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('fragment handling', () => {
  it('round-trips a key through the fragment format', async () => {
    const { key } = await encryptText('x');
    expect(readKeyFromHash(`#${buildFragment(key)}`)).toBe(key);
  });

  it('accepts a bare key without the prefix', () => {
    expect(readKeyFromHash('#abcDEF123_-')).toBe('abcDEF123_-');
  });

  it('returns null when the fragment is missing or empty', () => {
    expect(readKeyFromHash('')).toBeNull();
    expect(readKeyFromHash('#')).toBeNull();
    expect(readKeyFromHash(null)).toBeNull();
    expect(readKeyFromHash(undefined)).toBeNull();
  });

  it('rejects a fragment that is not base64url', () => {
    expect(readKeyFromHash('#section-heading!')).toBeNull();
    expect(readKeyFromHash('#k:has spaces')).toBeNull();
  });

  it('builds a share URL with the key in the fragment, never the query', async () => {
    const { key } = await encryptText('x');
    const url = buildShareUrl('https://example.com/', 'K8x2FmQp', key);

    expect(url.startsWith('https://example.com/p/K8x2FmQp#')).toBe(true);
    // The key must appear only after the '#'.
    const [beforeHash, afterHash] = url.split('#');
    expect(beforeHash).not.toContain(key);
    expect(afterHash).toContain(key);
    expect(url).not.toContain('?');
  });

  it('omits the fragment for pastes without a key', () => {
    expect(buildShareUrl('https://example.com', 'K8x2FmQp', null)).toBe('https://example.com/p/K8x2FmQp');
  });
});

/**
 * DOCUMENT mode reuses the same generic string-encryption primitives as CODE
 * and PLAIN TEXT — the only difference is that the string being encrypted is
 * JSON.stringify of a validated document rather than free text. These tests
 * exist to pin that contract down explicitly, since it's what lets
 * "encrypt the serialized document JSON client-side" be true without any
 * document-specific code in lib/crypto at all.
 */
describe('encrypting a document paste', () => {
  const DOCUMENT = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Confidential' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Secret plan details.' }] },
    ],
  };

  it('round-trips the serialized document through encrypt/decrypt', async () => {
    const serialized = JSON.stringify(DOCUMENT);
    const encrypted = await encryptText(serialized);
    const decrypted = await decryptPayload(encrypted, encrypted.key);

    expect(decrypted).toBe(serialized);
    const parsed = parseDocumentJson(decrypted);
    expect(docToPlainText(parsed)).toContain('Secret plan details.');
  });

  it('never leaves the document text readable in the ciphertext', async () => {
    const serialized = JSON.stringify(DOCUMENT);
    const encrypted = await encryptText(serialized);

    expect(encrypted.ciphertext).not.toContain('Confidential');
    expect(encrypted.ciphertext).not.toContain('Secret plan details');
  });

  it('re-encrypts with a fresh IV on edit, matching the edit-save flow', async () => {
    const original = await encryptText(JSON.stringify(DOCUMENT));
    const edited = { ...DOCUMENT, content: [...DOCUMENT.content, { type: 'paragraph', content: [{ type: 'text', text: 'Added later.' }] }] };
    const reEncrypted = await encryptTextWithKey(JSON.stringify(edited), original.key);

    expect(reEncrypted.iv).not.toBe(original.iv);
    const decrypted = await decryptPayload(reEncrypted, original.key);
    expect(docToPlainText(parseDocumentJson(decrypted))).toContain('Added later.');
  });
});
