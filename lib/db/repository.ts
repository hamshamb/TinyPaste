import type { NewPasteRecord, PasteRecord, PasteUpdate } from '@/types/paste';

/** Content fields returned by an atomic burn, captured before they are wiped. */
export type BurnedContent = {
  content: string | null;
  encryptedContent: string | null;
  encryptionIv: string | null;
  encryptionVersion: number | null;
};

/**
 * Storage contract. Everything above this line is transport-agnostic, which is
 * what lets the app run against Postgres in production and an in-process store
 * in development and E2E tests.
 */
export interface PasteRepository {
  readonly driver: 'supabase' | 'memory';
  /** Returns null when the slug is already taken, so the caller can retry. */
  create(record: NewPasteRecord): Promise<PasteRecord | null>;
  findBySlug(slug: string): Promise<PasteRecord | null>;
  update(slug: string, patch: PasteUpdate): Promise<PasteRecord | null>;
  delete(slug: string): Promise<boolean>;
  /**
   * Atomically claim a burn-after-reading paste. Exactly one concurrent caller
   * receives the content; everyone else receives null.
   */
  consumeBurn(slug: string): Promise<BurnedContent | null>;
  incrementViews(slug: string): Promise<void>;
  /** Housekeeping: hard-delete rows whose expiry has passed. */
  deleteExpired(now?: Date): Promise<number>;
}
