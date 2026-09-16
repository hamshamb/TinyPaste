import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryPasteRepository } from '@/lib/db/memory-repository';
import { generateSlug } from '@/lib/paste/slug';
import { hashEditToken, generateEditToken } from '@/lib/security/tokens';
import { resolveExpiresAt } from '@/lib/paste/expiration';
import type { NewPasteRecord } from '@/types/paste';

function newRecord(overrides: Partial<NewPasteRecord> = {}): NewPasteRecord {
  return {
    slug: generateSlug(),
    title: 'Test paste',
    content: 'hello world',
    encryptedContent: null,
    encryptionIv: null,
    encryptionVersion: null,
    isEncrypted: false,
    language: 'plaintext',
    contentType: 'code',
    createdAt: new Date().toISOString(),
    expiresAt: null,
    passwordHash: null,
    burnAfterRead: false,
    editTokenHash: hashEditToken(generateEditToken()),
    contentSize: 11,
    ...overrides,
  };
}

describe('MemoryPasteRepository', () => {
  let repo: MemoryPasteRepository;

  beforeEach(() => {
    repo = new MemoryPasteRepository();
  });

  it('stores and retrieves a paste by slug', async () => {
    const record = newRecord();
    const created = await repo.create(record);
    expect(created).not.toBeNull();
    expect(created!.slug).toBe(record.slug);
    expect(created!.id).toBeTruthy();

    const found = await repo.findBySlug(record.slug);
    expect(found?.content).toBe('hello world');
  });

  it('returns null for an unknown slug', async () => {
    expect(await repo.findBySlug('NoSuchSlug')).toBeNull();
  });

  it('signals a slug collision with null rather than overwriting', async () => {
    const record = newRecord({ slug: 'Duplicate' });
    expect(await repo.create(record)).not.toBeNull();
    expect(await repo.create(newRecord({ slug: 'Duplicate', content: 'different' }))).toBeNull();
    // The original must survive.
    expect((await repo.findBySlug('Duplicate'))?.content).toBe('hello world');
  });

  it('updates in place and bumps updatedAt', async () => {
    const record = newRecord();
    const created = await repo.create(record);
    const updated = await repo.update(record.slug, {
      title: 'Renamed',
      content: 'new body',
      encryptedContent: null,
      encryptionIv: null,
      encryptionVersion: null,
      language: 'markdown',
      expiresAt: null,
      contentSize: 8,
    });

    expect(updated?.title).toBe('Renamed');
    expect(updated?.content).toBe('new body');
    expect(updated?.language).toBe('markdown');
    // The edit token hash must not be disturbed by an edit.
    expect(updated?.editTokenHash).toBe(created!.editTokenHash);
  });

  it('returns null when updating a missing paste', async () => {
    const result = await repo.update('Missing1', {
      title: null,
      content: 'x',
      encryptedContent: null,
      encryptionIv: null,
      encryptionVersion: null,
      language: 'plaintext',
      expiresAt: null,
      contentSize: 1,
    });
    expect(result).toBeNull();
  });

  it('deletes a paste and reports whether anything was removed', async () => {
    const record = newRecord();
    await repo.create(record);
    expect(await repo.delete(record.slug)).toBe(true);
    expect(await repo.findBySlug(record.slug)).toBeNull();
    expect(await repo.delete(record.slug)).toBe(false);
  });

  it('increments views', async () => {
    const record = newRecord();
    await repo.create(record);
    await repo.incrementViews(record.slug);
    await repo.incrementViews(record.slug);
    expect((await repo.findBySlug(record.slug))?.views).toBe(2);
  });

  it('deletes only expired rows', async () => {
    const expired = newRecord({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
    const alive = newRecord({ expiresAt: resolveExpiresAt('30d')!.toISOString() });
    const never = newRecord({ expiresAt: null });
    await repo.create(expired);
    await repo.create(alive);
    await repo.create(never);

    expect(await repo.deleteExpired()).toBe(1);
    expect(await repo.findBySlug(expired.slug)).toBeNull();
    expect(await repo.findBySlug(alive.slug)).not.toBeNull();
    expect(await repo.findBySlug(never.slug)).not.toBeNull();
  });
});

/**
 * A dev-store snapshot written before content types existed has no
 * `contentType` field at all — this pins down that restoring one still
 * produces a fully-typed, usable record, the same guarantee
 * supabase/migrations/0002_content_types.sql gives a real database via its
 * backfill.
 */
describe('legacy snapshot compatibility', () => {
  function writeLegacySnapshot(rows: Array<Record<string, unknown>>): string {
    const dir = mkdtempSync(join(tmpdir(), 'tinypaste-legacy-'));
    const path = join(dir, 'pastes.json');
    writeFileSync(path, JSON.stringify(rows), 'utf8');
    return path;
  }

  it('infers "code" for a pre-existing row with a real language and no contentType field', async () => {
    const path = writeLegacySnapshot([
      {
        id: 'legacy-1',
        slug: 'Legacy001',
        title: 'Old code paste',
        content: 'console.log(1)',
        encryptedContent: null,
        encryptionIv: null,
        encryptionVersion: null,
        isEncrypted: false,
        language: 'javascript',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null,
        passwordHash: null,
        burnAfterRead: false,
        burnedAt: null,
        editTokenHash: 'x',
        views: 0,
        contentSize: 14,
        // contentType intentionally absent.
      },
    ]);

    const repo = new MemoryPasteRepository(path);
    const row = await repo.findBySlug('Legacy001');
    expect(row).not.toBeNull();
    expect(row!.contentType).toBe('code');
    // Nothing else about the pre-existing row is disturbed.
    expect(row!.content).toBe('console.log(1)');
  });

  it('infers "plaintext" for a pre-existing row whose language was literally plaintext', async () => {
    const path = writeLegacySnapshot([
      {
        id: 'legacy-2',
        slug: 'Legacy002',
        title: null,
        content: 'just some notes',
        encryptedContent: null,
        encryptionIv: null,
        encryptionVersion: null,
        isEncrypted: false,
        language: 'plaintext',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null,
        passwordHash: null,
        burnAfterRead: false,
        burnedAt: null,
        editTokenHash: 'x',
        views: 0,
        contentSize: 16,
      },
    ]);

    const repo = new MemoryPasteRepository(path);
    const row = await repo.findBySlug('Legacy002');
    expect(row!.contentType).toBe('plaintext');
  });

  it('leaves an already-typed row untouched', async () => {
    const path = writeLegacySnapshot([
      {
        id: 'modern-1',
        slug: 'Modern01',
        title: null,
        content: '{"type":"doc","content":[]}',
        encryptedContent: null,
        encryptionIv: null,
        encryptionVersion: null,
        isEncrypted: false,
        language: 'plaintext',
        contentType: 'document',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null,
        passwordHash: null,
        burnAfterRead: false,
        burnedAt: null,
        editTokenHash: 'x',
        views: 0,
        contentSize: 28,
      },
    ]);

    const repo = new MemoryPasteRepository(path);
    const row = await repo.findBySlug('Modern01');
    expect(row!.contentType).toBe('document');
  });
});

describe('burn-after-reading', () => {
  let repo: MemoryPasteRepository;

  beforeEach(() => {
    repo = new MemoryPasteRepository();
  });

  it('returns the content to the first caller', async () => {
    const record = newRecord({ burnAfterRead: true, content: 'one-shot secret' });
    await repo.create(record);

    const claimed = await repo.consumeBurn(record.slug);
    expect(claimed?.content).toBe('one-shot secret');
  });

  it('wipes the stored payload once claimed', async () => {
    const record = newRecord({ burnAfterRead: true, content: 'one-shot secret' });
    await repo.create(record);
    await repo.consumeBurn(record.slug);

    const row = await repo.findBySlug(record.slug);
    expect(row?.content).toBeNull();
    expect(row?.burnedAt).not.toBeNull();
  });

  it('refuses a second claim', async () => {
    const record = newRecord({ burnAfterRead: true });
    await repo.create(record);

    expect(await repo.consumeBurn(record.slug)).not.toBeNull();
    expect(await repo.consumeBurn(record.slug)).toBeNull();
    expect(await repo.consumeBurn(record.slug)).toBeNull();
  });

  it('gives the content to exactly one of many concurrent readers', async () => {
    const record = newRecord({ burnAfterRead: true, content: 'only once' });
    await repo.create(record);

    const results = await Promise.all(Array.from({ length: 25 }, () => repo.consumeBurn(record.slug)));
    const winners = results.filter((result) => result !== null);

    expect(winners).toHaveLength(1);
    expect(winners[0]!.content).toBe('only once');
  });

  it('refuses to claim a paste that is not burn-after-reading', async () => {
    const record = newRecord({ burnAfterRead: false });
    await repo.create(record);
    expect(await repo.consumeBurn(record.slug)).toBeNull();
    // An ordinary paste must remain readable.
    expect((await repo.findBySlug(record.slug))?.content).toBe('hello world');
  });

  it('refuses to claim an unknown slug', async () => {
    expect(await repo.consumeBurn('Missing1')).toBeNull();
  });

  it('hands back an encrypted payload intact before wiping it', async () => {
    const record = newRecord({
      burnAfterRead: true,
      isEncrypted: true,
      content: null,
      encryptedContent: 'Y2lwaGVy',
      encryptionIv: 'MTIzNDU2Nzg5MDEy',
      encryptionVersion: 1,
    });
    await repo.create(record);

    const claimed = await repo.consumeBurn(record.slug);
    expect(claimed?.encryptedContent).toBe('Y2lwaGVy');
    expect(claimed?.encryptionIv).toBe('MTIzNDU2Nzg5MDEy');

    const row = await repo.findBySlug(record.slug);
    expect(row?.encryptedContent).toBeNull();
    expect(row?.encryptionIv).toBeNull();
  });

  it('counts the burn as a view', async () => {
    const record = newRecord({ burnAfterRead: true });
    await repo.create(record);
    await repo.consumeBurn(record.slug);
    expect((await repo.findBySlug(record.slug))?.views).toBe(1);
  });
});
