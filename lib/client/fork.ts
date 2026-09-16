'use client';

import type { ContentTypeId } from '@/lib/paste/content-type';

export type ForkSeed = {
  /**
   * The Monaco source for code/plaintext, or JSON.stringify of the original
   * validated document for a document paste — never flattened to plain text,
   * so forking a document reopens Tiptap with the same structure.
   */
  content: string;
  language: string;
  contentType: ContentTypeId;
  title: string | null;
};

/**
 * Hand paste content to the create page.
 *
 * Held in a module variable rather than a URL parameter or web storage. Forked
 * content can be the decrypted body of an encrypted paste, so it must not reach
 * browser history, a Referer header, or anything written to disk. Fork uses a
 * client-side navigation, which keeps this module loaded; the seed is consumed
 * once and is gone on reload.
 */
let pendingSeed: ForkSeed | null = null;

export function seedFork(seed: ForkSeed): boolean {
  pendingSeed = seed;
  return true;
}

/** Read and clear the pending seed. Returns null when there is nothing to fork. */
export function consumeForkSeed(): ForkSeed | null {
  const seed = pendingSeed;
  pendingSeed = null;
  return seed;
}
