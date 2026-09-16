import 'server-only';
import { SLUG_COLLISION_RETRIES } from '@/lib/config/constants';
import { site } from '@/lib/config/site';
import { getRepository } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import { generateEditToken, hashEditToken, verifyEditToken } from '@/lib/security/tokens';
import { byteLength } from '@/lib/validation/paste';
import type { CreatePasteInput, UpdatePasteInput } from '@/lib/validation/paste';
import type {
  CreatePasteResult,
  NewPasteRecord,
  PasteContent,
  PasteMetadata,
  PastePayload,
  PasteRecord,
} from '@/types/paste';
import { isExpired, resolveExpiresAt, type ExpirationId } from './expiration';
import { generateSlug, isValidSlug } from './slug';
import type { LanguageId } from './languages';
import type { ContentTypeId } from './content-type';

/** Public metadata projection. Password and edit-token hashes never appear here. */
export function toMetadata(record: PasteRecord): PasteMetadata {
  return {
    slug: record.slug,
    title: record.title,
    language: record.language,
    contentType: record.contentType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    isEncrypted: record.isEncrypted,
    isPasswordProtected: record.passwordHash !== null,
    burnAfterRead: record.burnAfterRead,
    views: record.views,
    contentSize: record.contentSize,
  };
}

type BodySource = Pick<
  PasteRecord,
  'isEncrypted' | 'content' | 'encryptedContent' | 'encryptionIv' | 'encryptionVersion'
>;

function buildBody(source: BodySource): PasteContent {
  if (source.isEncrypted) {
    if (!source.encryptedContent || !source.encryptionIv) throw new AppError('PASTE_NOT_FOUND');
    return {
      kind: 'encrypted',
      ciphertext: source.encryptedContent,
      iv: source.encryptionIv,
      encryptionVersion: source.encryptionVersion ?? 1,
    };
  }
  return { kind: 'plaintext', content: source.content ?? '' };
}

/**
 * The single entry point for turning a slug into a row.
 *
 * Every read path goes through here, which is what guarantees expiry and burn
 * state can never be skipped by an individual route.
 */
export async function loadPasteRecord(slug: string): Promise<PasteRecord> {
  if (!isValidSlug(slug)) throw new AppError('PASTE_NOT_FOUND');

  const record = await getRepository().findBySlug(slug);
  // A deleted paste and a never-existing paste report identically, so responses
  // cannot be used to probe which slugs once existed.
  if (!record) throw new AppError('PASTE_NOT_FOUND');
  if (isExpired(record.expiresAt)) throw new AppError('PASTE_EXPIRED');
  if (record.burnAfterRead && record.burnedAt !== null) throw new AppError('PASTE_BURNED');
  return record;
}

/** Metadata only. Safe to render before any authentication has happened. */
export async function getPasteMetadata(slug: string): Promise<PasteMetadata> {
  return toMetadata(await loadPasteRecord(slug));
}

export type ReadOptions = {
  password?: string | null;
  /**
   * Burn-after-reading pastes are only consumed when the caller explicitly opts
   * in, so a link preview, a prefetch or the creator's own redirect cannot
   * destroy a paste before it has been shared.
   */
  allowBurn?: boolean;
  countView?: boolean;
};

/**
 * Read a paste body after every access check has passed.
 *
 * Ordering matters: the password gate runs before the burn claim, so a wrong
 * password can never consume someone else's one-shot paste.
 */
export async function readPasteContent(slug: string, options: ReadOptions = {}): Promise<PastePayload> {
  const record = await loadPasteRecord(slug);
  const repo = getRepository();

  if (record.passwordHash) {
    if (!options.password) throw new AppError('PASSWORD_REQUIRED');
    if (!(await verifyPassword(options.password, record.passwordHash))) {
      throw new AppError('INVALID_PASSWORD');
    }
  }

  if (record.burnAfterRead) {
    if (!options.allowBurn) {
      throw new AppError('EDIT_NOT_ALLOWED', {
        message: 'This paste must be revealed explicitly before it can be read.',
      });
    }
    // Atomic claim: exactly one concurrent reader receives the content.
    const captured = await repo.consumeBurn(slug);
    if (!captured) throw new AppError('PASTE_BURNED');
    return {
      meta: { ...toMetadata(record), views: record.views + 1 },
      body: buildBody({ ...record, ...captured }),
      burned: true,
    };
  }

  if (options.countView) await repo.incrementViews(slug);

  return {
    meta: { ...toMetadata(record), views: record.views + (options.countView ? 1 : 0) },
    body: buildBody(record),
    burned: false,
  };
}

/**
 * Plaintext for the raw and download routes.
 *
 * Those are plain GETs, so they cannot carry a password and must not be able to
 * consume a burn paste (a prefetching client or a link-preview bot would
 * silently destroy it). Both kinds are refused here rather than at each route.
 */
export async function readPlaintextForExport(slug: string): Promise<{ meta: PasteMetadata; text: string }> {
  const record = await loadPasteRecord(slug);
  if (record.passwordHash) throw new AppError('PASSWORD_REQUIRED');
  if (record.burnAfterRead) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'Burn-after-reading pastes can only be opened from the paste page.',
    });
  }
  if (record.isEncrypted) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'This paste is encrypted in the browser. The server holds no readable copy.',
    });
  }
  /**
   * A document paste's `content` column holds serialized document JSON, not
   * the text a human would want from "Raw" or a download — and the raw route
   * strips its own security headers on the way out, so this is not merely a
   * cosmetic choice. Document export is a client-side feature instead, built
   * from the same decrypted/loaded document the paste page already renders.
   */
  if (record.contentType === 'document') {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'Document pastes can only be exported from the paste page.',
    });
  }
  return { meta: toMetadata(record), text: record.content ?? '' };
}

function payloadFields(input: CreatePasteInput | UpdatePasteInput) {
  if (input.isEncrypted) {
    return {
      content: null,
      encryptedContent: input.encryptedContent,
      encryptionIv: input.encryptionIv,
      encryptionVersion: input.encryptionVersion,
      isEncrypted: true as const,
      contentSize: input.encryptedContent.length,
    };
  }
  return {
    content: input.content,
    encryptedContent: null,
    encryptionIv: null,
    encryptionVersion: null,
    isEncrypted: false as const,
    contentSize: byteLength(input.content),
  };
}

export async function createPaste(input: CreatePasteInput): Promise<CreatePasteResult> {
  const repo = getRepository();
  const editToken = generateEditToken();
  const createdAt = new Date();
  const fields = payloadFields(input);

  const base: Omit<NewPasteRecord, 'slug'> = {
    title: input.title,
    ...fields,
    language: input.language as LanguageId,
    contentType: input.contentType as ContentTypeId,
    createdAt: createdAt.toISOString(),
    expiresAt: resolveExpiresAt(input.expiration as ExpirationId, createdAt)?.toISOString() ?? null,
    // Only the hash is persisted; the plaintext password is discarded here.
    passwordHash: input.password ? await hashPassword(input.password) : null,
    burnAfterRead: input.burnAfterRead,
    editTokenHash: hashEditToken(editToken),
  };

  // Slugs are random, so a collision is vanishingly unlikely — but the unique
  // index is the authority, and a retry keeps creation correct if one happens.
  for (let attempt = 0; attempt < SLUG_COLLISION_RETRIES; attempt += 1) {
    const created = await repo.create({ ...base, slug: generateSlug() });
    if (created) {
      return {
        slug: created.slug,
        url: `${site.url}/p/${created.slug}`,
        editToken,
        meta: toMetadata(created),
      };
    }
  }
  throw new AppError('INTERNAL_ERROR', { message: 'Could not allocate a unique paste link.' });
}

/** Shared token check. Never trusts a client-side ownership claim. */
function assertOwner(record: PasteRecord, editToken: string | null | undefined): void {
  if (!editToken) throw new AppError('EDIT_TOKEN_REQUIRED');
  if (!verifyEditToken(editToken, record.editTokenHash)) throw new AppError('INVALID_EDIT_TOKEN');
}

/**
 * Authorise a mutation that also requires the paste to be readable.
 *
 * Goes through loadPasteRecord, so expiry and burn state apply — editing a
 * paste whose content is gone is meaningless.
 */
async function authorize(slug: string, editToken: string | null | undefined): Promise<PasteRecord> {
  const record = await loadPasteRecord(slug);
  assertOwner(record, editToken);
  return record;
}

/**
 * Authorise a *destructive* action, bypassing the read gate.
 *
 * Expiry and burn state make a paste unreadable, not unowned. Routing deletion
 * through loadPasteRecord would reject the owner with PASTE_EXPIRED or
 * PASTE_BURNED before the delete could run, stranding the row — permanently for
 * a burned paste that never expires, since the cleanup job only targets
 * expires_at. The row's content is already gone in that state, but its
 * metadata (notably the title) is not, so the creator must be able to remove it.
 *
 * This returns no content, only the row needed to verify the token.
 */
async function authorizeDestructive(
  slug: string,
  editToken: string | null | undefined,
): Promise<PasteRecord> {
  if (!isValidSlug(slug)) throw new AppError('PASTE_NOT_FOUND');
  const record = await getRepository().findBySlug(slug);
  if (!record) throw new AppError('PASTE_NOT_FOUND');
  assertOwner(record, editToken);
  return record;
}

export async function updatePaste(
  slug: string,
  editToken: string | null | undefined,
  input: UpdatePasteInput,
): Promise<PasteMetadata> {
  const record = await authorize(slug, editToken);

  /**
   * Version 1 forbids changing a paste's security mode. Editing a
   * burn-after-reading paste is meaningless (the payload is destroyed on first
   * read), and flipping encryption on or off would let a stale client turn a
   * ciphertext into plaintext — an unrecoverable downgrade.
   */
  if (record.burnAfterRead) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'Burn-after-reading pastes cannot be edited. Delete it and create a new one.',
    });
  }
  if (record.isEncrypted !== input.isEncrypted) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'The encryption mode of a paste cannot be changed after creation.',
    });
  }
  if (record.contentType !== input.contentType) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'The content type of a paste cannot be changed after creation.',
    });
  }

  const fields = payloadFields(input);
  const updated = await getRepository().update(slug, {
    title: input.title,
    content: fields.content,
    encryptedContent: fields.encryptedContent,
    encryptionIv: fields.encryptionIv,
    encryptionVersion: fields.encryptionVersion,
    language: input.language as LanguageId,
    // Expiry is recomputed from "now", matching what the edit form offers.
    expiresAt: resolveExpiresAt(input.expiration as ExpirationId)?.toISOString() ?? null,
    contentSize: fields.contentSize,
  });
  if (!updated) throw new AppError('PASTE_NOT_FOUND');
  return toMetadata(updated);
}

/**
 * Delete a paste. Works in every state, including expired and burned — see
 * authorizeDestructive for why those must remain deletable by their creator.
 */
export async function deletePaste(slug: string, editToken: string | null | undefined): Promise<void> {
  await authorizeDestructive(slug, editToken);
  const deleted = await getRepository().delete(slug);
  if (!deleted) throw new AppError('PASTE_NOT_FOUND');
}

/**
 * Data for the edit screen. Requires a valid edit token, and returns the body so
 * the owner can modify it — ciphertext for encrypted pastes, which the server
 * still cannot read.
 */
export async function loadForEdit(
  slug: string,
  editToken: string | null | undefined,
): Promise<{ meta: PasteMetadata; body: PasteContent }> {
  const record = await authorize(slug, editToken);
  if (record.burnAfterRead) {
    throw new AppError('EDIT_NOT_ALLOWED', {
      message: 'Burn-after-reading pastes cannot be edited. Delete it and create a new one.',
    });
  }
  return { meta: toMetadata(record), body: buildBody(record) };
}

/** Housekeeping entry point used by the cleanup route. */
export async function purgeExpired(): Promise<number> {
  return getRepository().deleteExpired();
}
