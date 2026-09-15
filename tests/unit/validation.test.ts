import { describe, expect, it } from 'vitest';
import { byteLength, createPasteSchema, formatIssues, updatePasteSchema } from '@/lib/validation/paste';
import { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/config/constants';
import { CURRENT_ENCRYPTION_VERSION } from '@/lib/crypto/constants';

const validPlain = {
  isEncrypted: false as const,
  content: 'hello world',
  title: 'Notes',
  language: 'plaintext',
  expiration: '1d',
  burnAfterRead: false,
  password: null,
};

const validEncrypted = {
  isEncrypted: true as const,
  encryptedContent: 'aGVsbG8gd29ybGQ=',
  encryptionIv: 'MTIzNDU2Nzg5MDEy',
  encryptionVersion: CURRENT_ENCRYPTION_VERSION,
  title: 'Secret',
  language: 'json',
  expiration: '1h',
  burnAfterRead: false,
};

describe('byteLength', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('é')).toBe(2);
    expect(byteLength('🔐')).toBe(4);
    // A string whose .length is 2 but which is 4 bytes on the wire.
    expect('🔐'.length).toBe(2);
  });
});

describe('createPasteSchema — plaintext', () => {
  it('accepts a well-formed paste', () => {
    const result = createPasteSchema.safeParse(validPlain);
    expect(result.success).toBe(true);
  });

  it('rejects empty and whitespace-only content', () => {
    expect(createPasteSchema.safeParse({ ...validPlain, content: '' }).success).toBe(false);
    expect(createPasteSchema.safeParse({ ...validPlain, content: '   \n\t ' }).success).toBe(false);
  });

  it('rejects content over the byte limit', () => {
    const tooBig = 'a'.repeat(MAX_CONTENT_BYTES + 1);
    expect(createPasteSchema.safeParse({ ...validPlain, content: tooBig }).success).toBe(false);
  });

  it('measures the limit in bytes, so multi-byte characters count fully', () => {
    // Half the byte budget in 4-byte characters is over the limit by length.
    const emoji = '🔐'.repeat(MAX_CONTENT_BYTES / 4 + 1);
    expect(createPasteSchema.safeParse({ ...validPlain, content: emoji }).success).toBe(false);
  });

  it('accepts content exactly at the limit', () => {
    const exact = 'a'.repeat(MAX_CONTENT_BYTES);
    expect(createPasteSchema.safeParse({ ...validPlain, content: exact }).success).toBe(true);
  });

  it('normalises a blank title to null', () => {
    const result = createPasteSchema.safeParse({ ...validPlain, title: '   ' });
    expect(result.success && result.data.title).toBeNull();
  });

  it('trims a title', () => {
    const result = createPasteSchema.safeParse({ ...validPlain, title: '  Notes  ' });
    expect(result.success && result.data.title).toBe('Notes');
  });

  it('rejects an over-long title', () => {
    const title = 'x'.repeat(MAX_TITLE_LENGTH + 1);
    expect(createPasteSchema.safeParse({ ...validPlain, title }).success).toBe(false);
  });

  it('rejects an unknown language', () => {
    expect(createPasteSchema.safeParse({ ...validPlain, language: 'brainfuck' }).success).toBe(false);
  });

  it('rejects an arbitrary expiration', () => {
    expect(createPasteSchema.safeParse({ ...validPlain, expiration: '3h' }).success).toBe(false);
    expect(createPasteSchema.safeParse({ ...validPlain, expiration: 3_600 }).success).toBe(false);
  });

  it('rejects a short password but accepts one at the minimum', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    const exact = 'x'.repeat(MIN_PASSWORD_LENGTH);
    expect(createPasteSchema.safeParse({ ...validPlain, password: short }).success).toBe(false);
    expect(createPasteSchema.safeParse({ ...validPlain, password: exact }).success).toBe(true);
  });

  it('stores pasted markup as ordinary content — escaping is a render concern', () => {
    const xss = '<script>alert("xss")</script>';
    const result = createPasteSchema.safeParse({ ...validPlain, content: xss });
    expect(result.success && result.data.isEncrypted === false && result.data.content).toBe(xss);
  });
});

describe('createPasteSchema — encrypted', () => {
  it('accepts a well-formed encrypted paste', () => {
    expect(createPasteSchema.safeParse(validEncrypted).success).toBe(true);
  });

  it('rejects an encrypted paste that also carries plaintext', () => {
    const result = createPasteSchema.safeParse({ ...validEncrypted, content: 'leaked plaintext' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-base64 ciphertext', () => {
    expect(
      createPasteSchema.safeParse({ ...validEncrypted, encryptedContent: 'not base64!!' }).success,
    ).toBe(false);
  });

  it('rejects an unknown encryption version', () => {
    expect(createPasteSchema.safeParse({ ...validEncrypted, encryptionVersion: 2 }).success).toBe(false);
  });

  it('rejects a missing IV', () => {
    const { encryptionIv: _iv, ...withoutIv } = validEncrypted;
    expect(createPasteSchema.safeParse(withoutIv).success).toBe(false);
  });

  it('refuses to combine browser encryption with a server password', () => {
    const result = createPasteSchema.safeParse({ ...validEncrypted, password: 'longenough' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error).join(' ')).toMatch(/cannot be both/i);
    }
  });

  it('allows an encrypted burn-after-reading paste', () => {
    expect(createPasteSchema.safeParse({ ...validEncrypted, burnAfterRead: true }).success).toBe(true);
  });
});

describe('updatePasteSchema', () => {
  it('accepts a plaintext edit', () => {
    const result = updatePasteSchema.safeParse({
      isEncrypted: false,
      content: 'updated',
      title: 'New title',
      language: 'markdown',
      expiration: '7d',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an encrypted edit', () => {
    const result = updatePasteSchema.safeParse({
      isEncrypted: true,
      encryptedContent: 'aGVsbG8=',
      encryptionIv: 'MTIzNDU2Nzg5MDEy',
      encryptionVersion: CURRENT_ENCRYPTION_VERSION,
      title: null,
      language: 'json',
      expiration: 'never',
    });
    expect(result.success).toBe(true);
  });

  it('has no way to set a password or the burn flag', () => {
    const result = updatePasteSchema.safeParse({
      isEncrypted: false,
      content: 'updated',
      title: null,
      language: 'plaintext',
      expiration: '1d',
      password: 'sneaky-password',
      burnAfterRead: true,
    });
    // Unknown keys are dropped rather than applied, so an edit cannot change
    // the security mode of an existing paste.
    expect(result.success).toBe(true);
    expect(result.success && 'password' in result.data).toBe(false);
    expect(result.success && 'burnAfterRead' in result.data).toBe(false);
  });
});

describe('formatIssues', () => {
  it('returns readable strings without echoing submitted values', () => {
    const result = createPasteSchema.safeParse({ ...validPlain, content: '', title: 'x'.repeat(200) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = formatIssues(result.error);
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(typeof issue).toBe('string');
        expect(issue).not.toContain('x'.repeat(50));
      }
    }
  });
});
