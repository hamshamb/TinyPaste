import { describe, expect, it } from 'vitest';
import { CONTENT_TYPES, inferLegacyContentType, isContentTypeId } from '@/lib/paste/content-type';

describe('isContentTypeId', () => {
  it('accepts every value in the closed set', () => {
    for (const id of CONTENT_TYPES) expect(isContentTypeId(id)).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isContentTypeId('wordprocessor')).toBe(false);
    expect(isContentTypeId('')).toBe(false);
    expect(isContentTypeId(undefined)).toBe(false);
    expect(isContentTypeId(null)).toBe(false);
    expect(isContentTypeId(42)).toBe(false);
  });
});

/**
 * Backward compatibility for every paste written before content types
 * existed — see supabase/migrations/0002_content_types.sql's backfill, which
 * this mirrors, and lib/db/memory-repository.ts / lib/db/supabase-repository.ts,
 * which both fall back to this for a row the migration (or an old dev
 * snapshot) hasn't stamped with a content_type of its own.
 */
describe('inferLegacyContentType', () => {
  it('treats a paste literally written as Plain Text as plaintext', () => {
    expect(inferLegacyContentType('plaintext')).toBe('plaintext');
  });

  it('treats every other pre-existing language as code, including plain code and languages nobody set', () => {
    expect(inferLegacyContentType('javascript')).toBe('code');
    expect(inferLegacyContentType('python')).toBe('code');
    expect(inferLegacyContentType('markdown')).toBe('code');
    // A row from before the language column existed, or an unrecognised value.
    expect(inferLegacyContentType('')).toBe('code');
    expect(inferLegacyContentType('not-a-real-language')).toBe('code');
  });
});
