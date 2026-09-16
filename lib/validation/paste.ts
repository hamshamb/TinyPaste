import { z } from 'zod';
import {
  MAX_CONTENT_BYTES,
  MAX_ENCRYPTED_PAYLOAD_CHARS,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '@/lib/config/constants';
import { EXPIRATION_IDS } from '@/lib/paste/expiration';
import { LANGUAGE_IDS } from '@/lib/paste/languages';
import { CONTENT_TYPES } from '@/lib/paste/content-type';
import { CURRENT_ENCRYPTION_VERSION } from '@/lib/crypto/constants';
import { DocumentValidationError, parseDocumentJson } from '@/lib/document/schema';

/** UTF-8 byte length — JavaScript string length would undercount emoji and CJK. */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function isWithinSizeLimit(value: string, limit: number = MAX_CONTENT_BYTES): boolean {
  return byteLength(value) <= limit;
}

const titleSchema = z
  .string()
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`)
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .nullable()
  .default(null);

const languageSchema = z.enum(LANGUAGE_IDS as unknown as [string, ...string[]]);
const expirationSchema = z.enum(EXPIRATION_IDS as unknown as [string, ...string[]]);
/**
 * Defaults to 'code' so a client that predates content types (or a direct API
 * caller that never heard of them) still produces a valid, correctly-typed row.
 */
const contentTypeSchema = z.enum(CONTENT_TYPES as unknown as [string, ...string[]]).default('code');

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);

const base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Malformed encrypted payload.');

const plaintextBody = z.object({
  isEncrypted: z.literal(false).default(false),
  content: z
    .string()
    .min(1, 'Paste content cannot be empty.')
    .refine((value) => value.trim().length > 0, 'Paste content cannot be empty.')
    .refine((value) => isWithinSizeLimit(value), 'Paste exceeds the maximum size.'),
  encryptedContent: z.undefined().optional(),
  encryptionIv: z.undefined().optional(),
  encryptionVersion: z.undefined().optional(),
});

const encryptedBody = z.object({
  isEncrypted: z.literal(true),
  content: z.undefined().optional(),
  encryptedContent: base64Schema.max(MAX_ENCRYPTED_PAYLOAD_CHARS, 'Paste exceeds the maximum size.'),
  encryptionIv: base64Schema.max(64),
  encryptionVersion: z.literal(CURRENT_ENCRYPTION_VERSION),
});

const commonCreateFields = {
  title: titleSchema,
  language: languageSchema,
  expiration: expirationSchema,
  contentType: contentTypeSchema,
  burnAfterRead: z.boolean().default(false),
  password: passwordSchema.nullable().optional().default(null),
};

/**
 * A document paste's `content` is JSON.stringify of a Tiptap/ProseMirror
 * document, not free-form text — so once the base shape (non-empty, within
 * the size cap) passes, it must also parse as one of the node/mark types
 * lib/document/schema.ts recognises. This only ever runs for the plaintext
 * branch: an encrypted document's content is ciphertext the server cannot
 * read, and is never asked to look like JSON.
 */
function checkDocumentContent(
  value: { isEncrypted: boolean; contentType: string; content?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.isEncrypted || value.contentType !== 'document' || typeof value.content !== 'string') return;
  try {
    parseDocumentJson(value.content);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      path: ['content'],
      message: error instanceof DocumentValidationError ? error.message : 'Invalid document content.',
    });
  }
}

export const createPasteSchema = z
  .discriminatedUnion('isEncrypted', [
    plaintextBody.extend(commonCreateFields),
    encryptedBody.extend(commonCreateFields),
  ])
  /**
   * Version 1 keeps browser encryption and server password protection mutually
   * exclusive. Combining them would imply two independent secrets guarding one
   * payload with confusing recovery semantics; see docs/SECURITY.md.
   */
  .refine((value) => !(value.isEncrypted && value.password), {
    message: 'A paste cannot be both browser-encrypted and password protected.',
    path: ['password'],
  })
  .superRefine(checkDocumentContent);

export type CreatePasteInput = z.infer<typeof createPasteSchema>;

/**
 * Editing deliberately cannot change the security mode of a paste: burn,
 * password, encryption and content-type flags are fixed at creation. Allowing
 * transitions would let a stale client downgrade an encrypted paste to
 * plaintext, or reinterpret a code paste's source as if it were document JSON.
 */
export const updatePasteSchema = z
  .discriminatedUnion('isEncrypted', [
    plaintextBody.extend({
      title: titleSchema,
      language: languageSchema,
      expiration: expirationSchema,
      contentType: contentTypeSchema,
    }),
    encryptedBody.extend({
      title: titleSchema,
      language: languageSchema,
      expiration: expirationSchema,
      contentType: contentTypeSchema,
    }),
  ])
  .superRefine(checkDocumentContent);

export type UpdatePasteInput = z.infer<typeof updatePasteSchema>;

export const unlockSchema = z.object({
  password: z.string().min(1, 'Enter the password.').max(MAX_PASSWORD_LENGTH),
});

/** Flatten Zod issues into plain strings — never echo the submitted values back. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.filter((p) => typeof p === 'string').join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
