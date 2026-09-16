/**
 * What kind of editor produced a paste's content, and therefore how the
 * stored string (or, once decrypted, the plaintext) must be interpreted.
 *
 *   code       — Monaco, a real programming language, syntax highlighted.
 *   plaintext  — Monaco with highlighting off. Still just a string.
 *   document   — Tiptap. The stored string is JSON.stringify of a ProseMirror
 *                document, validated against lib/document/schema.ts before it
 *                is ever written.
 *
 * A paste's content type is fixed at creation, the same way its encryption
 * mode is — see the immutability check in lib/paste/service.ts.
 */
export const CONTENT_TYPES = ['code', 'plaintext', 'document'] as const;

export type ContentTypeId = (typeof CONTENT_TYPES)[number];

export const DEFAULT_CONTENT_TYPE: ContentTypeId = 'code';

const CONTENT_TYPE_SET = new Set<string>(CONTENT_TYPES);

export function isContentTypeId(value: unknown): value is ContentTypeId {
  return typeof value === 'string' && CONTENT_TYPE_SET.has(value);
}

/**
 * Rows written before this feature existed have no content_type column value
 * of their own opinion — the migration backfills the database itself, but the
 * in-memory dev store's JSON snapshot predates that and won't have the field.
 * A paste created through the old plaintext-only editor is code unless its
 * language was literally "Plain Text".
 */
export function inferLegacyContentType(language: string): ContentTypeId {
  return language === 'plaintext' ? 'plaintext' : 'code';
}
