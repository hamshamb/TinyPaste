import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPasteRepository } from '@/lib/db/memory-repository';
import {
  createPaste,
  deletePaste,
  getPasteMetadata,
  loadForEdit,
  readPasteContent,
  readPlaintextForExport,
  updatePaste,
} from '@/lib/paste/service';
import { AppError } from '@/lib/errors';
import type { CreatePasteInput } from '@/lib/validation/paste';

/**
 * The service resolves its repository through a globalThis cache, so injecting
 * a fresh in-memory store here exercises the real access-control code paths
 * without a database.
 */
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

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof AppError && error.code === code,
    `expected AppError with code ${code}`,
  );
}

describe('createPaste', () => {
  it('returns a slug, a URL and a one-time edit token', async () => {
    const result = await createPaste(plainInput());
    expect(result.slug).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(result.url).toContain(`/p/${result.slug}`);
    expect(result.editToken.length).toBeGreaterThan(30);
  });

  it('never persists the raw edit token', async () => {
    const result = await createPaste(plainInput());
    const row = await repo.findBySlug(result.slug);
    expect(row?.editTokenHash).toBeTruthy();
    expect(row?.editTokenHash).not.toBe(result.editToken);
    expect(JSON.stringify(row)).not.toContain(result.editToken);
  });

  it('never persists a plaintext password', async () => {
    const result = await createPaste(plainInput({ password: 'super-secret-pw' }));
    const row = await repo.findBySlug(result.slug);
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(row)).not.toContain('super-secret-pw');
  });

  it('stores ciphertext and no plaintext for an encrypted paste', async () => {
    const result = await createPaste({
      isEncrypted: true,
      encryptedContent: 'Y2lwaGVydGV4dA==',
      encryptionIv: 'MTIzNDU2Nzg5MDEy',
      encryptionVersion: 1,
      title: 'Secret',
      language: 'json',
      expiration: '1h',
      burnAfterRead: false,
      password: null,
    } as CreatePasteInput);

    const row = await repo.findBySlug(result.slug);
    expect(row?.content).toBeNull();
    expect(row?.encryptedContent).toBe('Y2lwaGVydGV4dA==');
    expect(row?.isEncrypted).toBe(true);
  });

  it('computes expiry from the chosen option', async () => {
    const never = await createPaste(plainInput({ expiration: 'never' }));
    expect((await repo.findBySlug(never.slug))?.expiresAt).toBeNull();

    const tenMinutes = await createPaste(plainInput({ expiration: '10m' }));
    const row = await repo.findBySlug(tenMinutes.slug);
    const delta = new Date(row!.expiresAt!).getTime() - new Date(row!.createdAt).getTime();
    expect(delta).toBe(10 * 60 * 1000);
  });
});

describe('metadata exposure', () => {
  it('never includes the password hash or the edit token hash', async () => {
    const created = await createPaste(plainInput({ password: 'a-good-password' }));
    const meta = await getPasteMetadata(created.slug);

    expect(meta.isPasswordProtected).toBe(true);
    expect(JSON.stringify(meta)).not.toContain('$2');
    expect('passwordHash' in meta).toBe(false);
    expect('editTokenHash' in meta).toBe(false);
    expect('content' in meta).toBe(false);
    expect('id' in meta).toBe(false);
  });
});

describe('reading', () => {
  it('returns the body for an ordinary paste', async () => {
    const created = await createPaste(plainInput({ content: 'readable' }));
    const payload = await readPasteContent(created.slug);
    expect(payload.body).toEqual({ kind: 'plaintext', content: 'readable' });
    expect(payload.burned).toBe(false);
  });

  it('counts a view only when asked', async () => {
    const created = await createPaste(plainInput());
    await readPasteContent(created.slug, { countView: false });
    expect((await repo.findBySlug(created.slug))?.views).toBe(0);

    await readPasteContent(created.slug, { countView: true });
    expect((await repo.findBySlug(created.slug))?.views).toBe(1);
  });

  it('reports a missing paste as not found', async () => {
    await expectAppError(readPasteContent('Missing1'), 'PASTE_NOT_FOUND');
  });

  it('reports an invalid slug as not found, not as a validation error', async () => {
    // Identical responses stop a caller probing which slugs ever existed.
    await expectAppError(readPasteContent('../../etc/passwd'), 'PASTE_NOT_FOUND');
  });

  it('refuses an expired paste', async () => {
    const created = await createPaste(plainInput({ expiration: '10m' }));
    await repo.update(created.slug, {
      title: null,
      content: 'still here',
      encryptedContent: null,
      encryptionIv: null,
      encryptionVersion: null,
      language: 'plaintext',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      contentSize: 10,
    });

    await expectAppError(readPasteContent(created.slug), 'PASTE_EXPIRED');
    await expectAppError(getPasteMetadata(created.slug), 'PASTE_EXPIRED');
    await expectAppError(readPlaintextForExport(created.slug), 'PASTE_EXPIRED');
  });
});

describe('password protection', () => {
  it('refuses to return the body without a password', async () => {
    const created = await createPaste(plainInput({ password: 'a-good-password' }));
    await expectAppError(readPasteContent(created.slug), 'PASSWORD_REQUIRED');
  });

  it('refuses a wrong password', async () => {
    const created = await createPaste(plainInput({ password: 'a-good-password' }));
    await expectAppError(readPasteContent(created.slug, { password: 'wrong' }), 'INVALID_PASSWORD');
  });

  it('returns the body for the right password', async () => {
    const created = await createPaste(plainInput({ content: 'guarded', password: 'a-good-password' }));
    const payload = await readPasteContent(created.slug, { password: 'a-good-password' });
    expect(payload.body).toEqual({ kind: 'plaintext', content: 'guarded' });
  });

  it('blocks the raw and download routes entirely', async () => {
    const created = await createPaste(plainInput({ password: 'a-good-password' }));
    await expectAppError(readPlaintextForExport(created.slug), 'PASSWORD_REQUIRED');
  });
});

describe('burn after reading', () => {
  it('is not consumed by loading metadata', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await getPasteMetadata(created.slug);
    await getPasteMetadata(created.slug);
    expect((await repo.findBySlug(created.slug))?.burnedAt).toBeNull();
  });

  it('is not consumed by a read that does not opt in', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await expectAppError(readPasteContent(created.slug), 'EDIT_NOT_ALLOWED');
    expect((await repo.findBySlug(created.slug))?.burnedAt).toBeNull();
  });

  it('is consumed by an explicit reveal', async () => {
    const created = await createPaste(plainInput({ content: 'one-shot', burnAfterRead: true }));
    const payload = await readPasteContent(created.slug, { allowBurn: true });

    expect(payload.body).toEqual({ kind: 'plaintext', content: 'one-shot' });
    expect(payload.burned).toBe(true);
  });

  it('is unavailable after the first reveal', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await readPasteContent(created.slug, { allowBurn: true });

    await expectAppError(readPasteContent(created.slug, { allowBurn: true }), 'PASTE_BURNED');
    await expectAppError(getPasteMetadata(created.slug), 'PASTE_BURNED');
  });

  it('serves exactly one of many simultaneous reveals', async () => {
    const created = await createPaste(plainInput({ content: 'race', burnAfterRead: true }));

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => readPasteContent(created.slug, { allowBurn: true })),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');

    expect(fulfilled).toHaveLength(1);
  });

  it('checks the password before burning, so a wrong guess cannot destroy it', async () => {
    const created = await createPaste(
      plainInput({ content: 'guarded one-shot', burnAfterRead: true, password: 'a-good-password' }),
    );

    await expectAppError(
      readPasteContent(created.slug, { password: 'wrong', allowBurn: true }),
      'INVALID_PASSWORD',
    );
    expect((await repo.findBySlug(created.slug))?.burnedAt).toBeNull();

    const payload = await readPasteContent(created.slug, { password: 'a-good-password', allowBurn: true });
    expect(payload.body).toEqual({ kind: 'plaintext', content: 'guarded one-shot' });
    expect((await repo.findBySlug(created.slug))?.burnedAt).not.toBeNull();
  });

  it('is refused by the raw and download routes', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await expectAppError(readPlaintextForExport(created.slug), 'EDIT_NOT_ALLOWED');
    // Crucially, the refusal must not have consumed it.
    expect((await repo.findBySlug(created.slug))?.burnedAt).toBeNull();
  });
});

describe('export routes', () => {
  it('serve an ordinary paste', async () => {
    const created = await createPaste(plainInput({ content: 'exportable' }));
    const { text } = await readPlaintextForExport(created.slug);
    expect(text).toBe('exportable');
  });

  it('refuse an encrypted paste, since the server holds no readable copy', async () => {
    const created = await createPaste({
      isEncrypted: true,
      encryptedContent: 'Y2lwaGVy',
      encryptionIv: 'MTIzNDU2Nzg5MDEy',
      encryptionVersion: 1,
      title: null,
      language: 'plaintext',
      expiration: '1d',
      burnAfterRead: false,
      password: null,
    } as CreatePasteInput);

    await expectAppError(readPlaintextForExport(created.slug), 'EDIT_NOT_ALLOWED');
  });
});

describe('edit token authorisation', () => {
  const edit = {
    isEncrypted: false as const,
    content: 'edited body',
    title: 'Edited',
    language: 'markdown',
    expiration: '7d',
  };

  it('accepts the creator token', async () => {
    const created = await createPaste(plainInput());
    const meta = await updatePaste(created.slug, created.editToken, edit);
    expect(meta.title).toBe('Edited');
    expect((await repo.findBySlug(created.slug))?.content).toBe('edited body');
  });

  it('refuses a missing token', async () => {
    const created = await createPaste(plainInput());
    await expectAppError(updatePaste(created.slug, null, edit), 'EDIT_TOKEN_REQUIRED');
    await expectAppError(deletePaste(created.slug, undefined), 'EDIT_TOKEN_REQUIRED');
  });

  it('refuses a wrong token', async () => {
    const created = await createPaste(plainInput());
    const other = await createPaste(plainInput());

    await expectAppError(updatePaste(created.slug, other.editToken, edit), 'INVALID_EDIT_TOKEN');
    await expectAppError(deletePaste(created.slug, 'forged-token'), 'INVALID_EDIT_TOKEN');
    await expectAppError(loadForEdit(created.slug, other.editToken), 'INVALID_EDIT_TOKEN');

    // Nothing may have changed.
    expect((await repo.findBySlug(created.slug))?.content).toBe('hello world');
  });

  it('deletes with a valid token', async () => {
    const created = await createPaste(plainInput());
    await deletePaste(created.slug, created.editToken);

    expect(await repo.findBySlug(created.slug)).toBeNull();
    await expectAppError(readPasteContent(created.slug), 'PASTE_NOT_FOUND');
  });
});

describe('deleting a paste that can no longer be read', () => {
  /**
   * Regression: delete used to run through the read gate, so an owner was
   * rejected with PASTE_BURNED / PASTE_EXPIRED and the row was stranded — for a
   * burned paste that never expires, permanently, since cleanup only targets
   * expires_at.
   */
  it('deletes a burned paste', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await readPasteContent(created.slug, { allowBurn: true });
    expect((await repo.findBySlug(created.slug))?.burnedAt).not.toBeNull();

    await deletePaste(created.slug, created.editToken);
    expect(await repo.findBySlug(created.slug)).toBeNull();
  });

  it('deletes an expired paste', async () => {
    const created = await createPaste(plainInput({ expiration: '10m' }));
    await repo.update(created.slug, {
      title: null,
      content: 'stranded',
      encryptedContent: null,
      encryptionIv: null,
      encryptionVersion: null,
      language: 'plaintext',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      contentSize: 8,
    });
    await expectAppError(readPasteContent(created.slug), 'PASTE_EXPIRED');

    await deletePaste(created.slug, created.editToken);
    expect(await repo.findBySlug(created.slug)).toBeNull();
  });

  it('still requires a valid edit token when the paste is burned', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    const other = await createPaste(plainInput());
    await readPasteContent(created.slug, { allowBurn: true });

    await expectAppError(deletePaste(created.slug, null), 'EDIT_TOKEN_REQUIRED');
    await expectAppError(deletePaste(created.slug, other.editToken), 'INVALID_EDIT_TOKEN');
    // Bypassing the read gate must not have bypassed ownership.
    expect(await repo.findBySlug(created.slug)).not.toBeNull();
  });

  it('still reports a genuinely missing paste as not found', async () => {
    await expectAppError(deletePaste('Missing1', 'any-token'), 'PASTE_NOT_FOUND');
  });

  it('does not let the bypass reach editing', async () => {
    // Only deletion skips the read gate; editing an unreadable paste stays refused.
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await readPasteContent(created.slug, { allowBurn: true });
    await expectAppError(
      updatePaste(created.slug, created.editToken, {
        isEncrypted: false,
        content: 'revived',
        title: null,
        language: 'plaintext',
        expiration: '1d',
      }),
      'PASTE_BURNED',
    );
  });
});

describe('edit restrictions', () => {
  it('refuses to edit a burn-after-reading paste', async () => {
    const created = await createPaste(plainInput({ burnAfterRead: true }));
    await expectAppError(
      updatePaste(created.slug, created.editToken, {
        isEncrypted: false,
        content: 'x',
        title: null,
        language: 'plaintext',
        expiration: '1d',
      }),
      'EDIT_NOT_ALLOWED',
    );
    await expectAppError(loadForEdit(created.slug, created.editToken), 'EDIT_NOT_ALLOWED');
  });

  it('refuses to turn an encrypted paste into plaintext', async () => {
    const created = await createPaste({
      isEncrypted: true,
      encryptedContent: 'Y2lwaGVy',
      encryptionIv: 'MTIzNDU2Nzg5MDEy',
      encryptionVersion: 1,
      title: null,
      language: 'plaintext',
      expiration: '1d',
      burnAfterRead: false,
      password: null,
    } as CreatePasteInput);

    await expectAppError(
      updatePaste(created.slug, created.editToken, {
        isEncrypted: false,
        content: 'downgraded to plaintext',
        title: null,
        language: 'plaintext',
        expiration: '1d',
      }),
      'EDIT_NOT_ALLOWED',
    );
    expect((await repo.findBySlug(created.slug))?.encryptedContent).toBe('Y2lwaGVy');
  });

  it('refuses to turn a plaintext paste into an encrypted one', async () => {
    const created = await createPaste(plainInput());
    await expectAppError(
      updatePaste(created.slug, created.editToken, {
        isEncrypted: true,
        encryptedContent: 'Y2lwaGVy',
        encryptionIv: 'MTIzNDU2Nzg5MDEy',
        encryptionVersion: 1,
        title: null,
        language: 'plaintext',
        expiration: '1d',
      }),
      'EDIT_NOT_ALLOWED',
    );
  });

  it('keeps the password hash across an edit', async () => {
    const created = await createPaste(plainInput({ password: 'a-good-password' }));
    const before = (await repo.findBySlug(created.slug))?.passwordHash;

    await updatePaste(created.slug, created.editToken, {
      isEncrypted: false,
      content: 'edited',
      title: null,
      language: 'plaintext',
      expiration: '1d',
    });

    const after = await repo.findBySlug(created.slug);
    expect(after?.passwordHash).toBe(before);
    await expectAppError(readPasteContent(created.slug), 'PASSWORD_REQUIRED');
  });
});
