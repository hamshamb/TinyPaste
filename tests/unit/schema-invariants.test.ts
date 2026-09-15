import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPasteRepository } from '@/lib/db/memory-repository';
import { createPaste, readPasteContent, updatePaste } from '@/lib/paste/service';
import type { CreatePasteInput } from '@/lib/validation/paste';
import type { PasteRecord } from '@/types/paste';

/**
 * Guards the seam between application code and the database schema.
 *
 * The CHECK constraints in supabase/migrations/0001_init.sql are enforced by
 * Postgres, which the in-memory repository used in development and E2E does not
 * emulate. Without this file, a change to the service layer could produce rows
 * that pass every other test and then fail at runtime against a real database.
 *
 * The predicates below mirror the SQL exactly. If a constraint changes in the
 * migration, change it here too — a failure in this file means the application
 * and the schema have drifted apart.
 */

type Row = {
  is_encrypted: boolean;
  content: string | null;
  encrypted_content: string | null;
  encryption_iv: string | null;
  encryption_version: number | null;
  burned_at: string | null;
  burn_after_read: boolean;
  password_hash: string | null;
  content_size: number;
  title: string | null;
  slug: string;
};

/** camelCase record -> the snake_case column shape the constraints are written against. */
function toRow(record: PasteRecord): Row {
  return {
    is_encrypted: record.isEncrypted,
    content: record.content,
    encrypted_content: record.encryptedContent,
    encryption_iv: record.encryptionIv,
    encryption_version: record.encryptionVersion,
    burned_at: record.burnedAt,
    burn_after_read: record.burnAfterRead,
    password_hash: record.passwordHash,
    content_size: record.contentSize,
    title: record.title,
    slug: record.slug,
  };
}

/** constraint pastes_payload_shape */
function payloadShape(r: Row): boolean {
  return (
    (r.is_encrypted === false &&
      r.encrypted_content === null &&
      r.encryption_iv === null &&
      r.encryption_version === null &&
      (r.burned_at !== null || r.content !== null)) ||
    (r.is_encrypted === true &&
      r.content === null &&
      r.encryption_version !== null &&
      (r.burned_at !== null || (r.encrypted_content !== null && r.encryption_iv !== null)))
  );
}

/** constraint pastes_burn_state */
const burnState = (r: Row) => r.burned_at === null || r.burn_after_read === true;
/** constraint pastes_content_size_nonnegative */
const contentSizeNonNegative = (r: Row) => r.content_size >= 0;
/** constraint pastes_encryption_excludes_password */
const encryptionExcludesPassword = (r: Row) => r.is_encrypted === false || r.password_hash === null;
/** constraint pastes_title_length */
const titleLength = (r: Row) => r.title === null || r.title.length <= 120;
/** constraint pastes_slug_shape */
const slugShape = (r: Row) => /^[A-Za-z0-9]{4,16}$/.test(r.slug);

function expectSatisfiesSchema(record: PasteRecord, label: string): void {
  const row = toRow(record);
  expect(payloadShape(row), `${label}: pastes_payload_shape`).toBe(true);
  expect(burnState(row), `${label}: pastes_burn_state`).toBe(true);
  expect(contentSizeNonNegative(row), `${label}: pastes_content_size_nonnegative`).toBe(true);
  expect(encryptionExcludesPassword(row), `${label}: pastes_encryption_excludes_password`).toBe(true);
  expect(titleLength(row), `${label}: pastes_title_length`).toBe(true);
  expect(slugShape(row), `${label}: pastes_slug_shape`).toBe(true);
}

const store = globalThis as typeof globalThis & { __tinypasteRepository?: MemoryPasteRepository };
let repo: MemoryPasteRepository;

beforeEach(() => {
  repo = new MemoryPasteRepository();
  store.__tinypasteRepository = repo;
});

function plainInput(overrides: Partial<CreatePasteInput> = {}): CreatePasteInput {
  return {
    isEncrypted: false,
    content: 'hello world',
    title: 'Notes',
    language: 'plaintext',
    expiration: '1d',
    burnAfterRead: false,
    password: null,
    ...overrides,
  } as CreatePasteInput;
}

function encryptedInput(overrides: Partial<CreatePasteInput> = {}): CreatePasteInput {
  return {
    isEncrypted: true,
    encryptedContent: 'Y2lwaGVydGV4dA==',
    encryptionIv: 'MTIzNDU2Nzg5MDEy',
    encryptionVersion: 1,
    title: 'Secret',
    language: 'json',
    expiration: '1h',
    burnAfterRead: false,
    password: null,
    ...overrides,
  } as CreatePasteInput;
}

describe('rows written by createPaste satisfy the database constraints', () => {
  it.each([
    ['plaintext', plainInput()],
    ['plaintext with a password', plainInput({ password: 'a-good-password' })],
    ['plaintext, burn after reading', plainInput({ burnAfterRead: true })],
    ['plaintext, never expires', plainInput({ expiration: 'never' })],
    ['plaintext, no title', plainInput({ title: null })],
    ['encrypted', encryptedInput()],
    ['encrypted, burn after reading', encryptedInput({ burnAfterRead: true })],
    ['encrypted, never expires', encryptedInput({ expiration: 'never' })],
  ])('%s', async (label, input) => {
    const created = await createPaste(input);
    const row = await repo.findBySlug(created.slug);
    expect(row).not.toBeNull();
    expectSatisfiesSchema(row!, label);
  });
});

describe('rows written by updatePaste satisfy the database constraints', () => {
  it('after a plaintext edit', async () => {
    const created = await createPaste(plainInput());
    await updatePaste(created.slug, created.editToken, {
      isEncrypted: false,
      content: 'edited body',
      title: 'Edited',
      language: 'markdown',
      expiration: '30d',
    });
    expectSatisfiesSchema((await repo.findBySlug(created.slug))!, 'plaintext edit');
  });

  it('after an encrypted edit', async () => {
    const created = await createPaste(encryptedInput());
    await updatePaste(created.slug, created.editToken, {
      isEncrypted: true,
      encryptedContent: 'bmV3Y2lwaGVy',
      encryptionIv: 'OTg3NjU0MzIxMDk4',
      encryptionVersion: 1,
      title: null,
      language: 'json',
      expiration: 'never',
    });
    expectSatisfiesSchema((await repo.findBySlug(created.slug))!, 'encrypted edit');
  });

  it('a plaintext edit never leaves a stray encryption_version', async () => {
    const created = await createPaste(plainInput());
    await updatePaste(created.slug, created.editToken, {
      isEncrypted: false,
      content: 'edited',
      title: null,
      language: 'plaintext',
      expiration: '1d',
    });
    const row = await repo.findBySlug(created.slug);
    // The constraint rejects a plaintext row carrying any encryption metadata.
    expect(row!.encryptionVersion).toBeNull();
    expect(row!.encryptedContent).toBeNull();
    expect(row!.encryptionIv).toBeNull();
  });
});

describe('rows left behind by a burn satisfy the database constraints', () => {
  it('plaintext burn', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await readPasteContent(created.slug, { allowBurn: true });

    const row = await repo.findBySlug(created.slug);
    expectSatisfiesSchema(row!, 'burned plaintext');
    expect(row!.content).toBeNull();
    expect(row!.burnedAt).not.toBeNull();
  });

  it('encrypted burn keeps encryption_version, which the constraint requires', async () => {
    const created = await createPaste(encryptedInput({ burnAfterRead: true }));
    await readPasteContent(created.slug, { allowBurn: true });

    const row = await repo.findBySlug(created.slug);
    expectSatisfiesSchema(row!, 'burned encrypted');
    expect(row!.encryptedContent).toBeNull();
    expect(row!.encryptionIv).toBeNull();
    // Nulling this too would violate pastes_payload_shape.
    expect(row!.encryptionVersion).not.toBeNull();
  });

  it('burned_at is only ever set on a burn-after-reading row', async () => {
    const plain = await createPaste(plainInput());
    expect((await repo.findBySlug(plain.slug))!.burnedAt).toBeNull();

    const burnable = await createPaste(plainInput({ burnAfterRead: true }));
    await readPasteContent(burnable.slug, { allowBurn: true });
    const row = await repo.findBySlug(burnable.slug);
    expect(row!.burnedAt).not.toBeNull();
    expect(row!.burnAfterRead).toBe(true);
  });
});

describe('the constraint predicates reject the states they are meant to', () => {
  const base: Row = {
    is_encrypted: false,
    content: 'hi',
    encrypted_content: null,
    encryption_iv: null,
    encryption_version: null,
    burned_at: null,
    burn_after_read: false,
    password_hash: null,
    content_size: 2,
    title: null,
    slug: 'K8x2FmQp',
  };

  it('rejects an unburned encrypted row with no ciphertext', () => {
    // The case that motivated tightening pastes_payload_shape: a broken
    // encrypted paste that the looser constraint would have accepted.
    expect(payloadShape({ ...base, is_encrypted: true, content: null, encryption_version: 1 })).toBe(false);
  });

  it('rejects an encrypted row with ciphertext but no IV', () => {
    expect(
      payloadShape({
        ...base,
        is_encrypted: true,
        content: null,
        encrypted_content: 'Yw==',
        encryption_version: 1,
      }),
    ).toBe(false);
  });

  it('rejects an unburned plaintext row with no content', () => {
    expect(payloadShape({ ...base, content: null })).toBe(false);
  });

  it('rejects a plaintext row carrying encryption metadata', () => {
    expect(payloadShape({ ...base, encryption_version: 1 })).toBe(false);
    expect(payloadShape({ ...base, encrypted_content: 'Yw==' })).toBe(false);
  });

  it('rejects burned_at without burn_after_read', () => {
    expect(burnState({ ...base, burned_at: 'now' })).toBe(false);
  });

  it('rejects a negative content_size', () => {
    expect(contentSizeNonNegative({ ...base, content_size: -1 })).toBe(false);
  });

  it('rejects encryption combined with a password', () => {
    expect(
      encryptionExcludesPassword({ ...base, is_encrypted: true, password_hash: '$2b$12$x' }),
    ).toBe(false);
  });
});
