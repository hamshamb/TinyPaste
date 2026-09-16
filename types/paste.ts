import type { LanguageId } from '@/lib/paste/languages';
import type { ContentTypeId } from '@/lib/paste/content-type';

/** Full database row. Never leaves the server unfiltered. */
export type PasteRecord = {
  id: string;
  slug: string;
  title: string | null;
  /**
   * Plaintext body. Null for browser-encrypted pastes.
   *
   * For a `document` paste this is JSON.stringify of a validated
   * lib/document/schema.ts document, not free text — see contentType.
   */
  content: string | null;
  /** Base64 AES-GCM ciphertext. Null for plaintext pastes. */
  encryptedContent: string | null;
  /** Base64 AES-GCM IV. Null for plaintext pastes. */
  encryptionIv: string | null;
  encryptionVersion: number | null;
  isEncrypted: boolean;
  language: LanguageId;
  /** How `content` (once decrypted, for an encrypted paste) is interpreted. */
  contentType: ContentTypeId;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  passwordHash: string | null;
  burnAfterRead: boolean;
  burnedAt: string | null;
  editTokenHash: string;
  views: number;
  contentSize: number;
};

/** Safe to render before any authentication has happened. */
export type PasteMetadata = {
  slug: string;
  title: string | null;
  language: LanguageId;
  contentType: ContentTypeId;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isEncrypted: boolean;
  isPasswordProtected: boolean;
  burnAfterRead: boolean;
  views: number;
  contentSize: number;
};

/** Returned only after every access check has passed. */
export type PasteContent =
  | { kind: 'plaintext'; content: string }
  | { kind: 'encrypted'; ciphertext: string; iv: string; encryptionVersion: number };

export type PastePayload = {
  meta: PasteMetadata;
  body: PasteContent;
  /** True when this read consumed a burn-after-reading paste. */
  burned: boolean;
};

export type CreatePasteResult = {
  slug: string;
  url: string;
  editToken: string;
  meta: PasteMetadata;
};

/** What the create/update layers hand to the repository. */
export type NewPasteRecord = Omit<PasteRecord, 'id' | 'views' | 'burnedAt' | 'updatedAt'>;

export type PasteUpdate = {
  title: string | null;
  content: string | null;
  encryptedContent: string | null;
  encryptionIv: string | null;
  encryptionVersion: number | null;
  language: LanguageId;
  expiresAt: string | null;
  contentSize: number;
};
