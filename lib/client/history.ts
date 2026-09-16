'use client';

import { LOCAL_HISTORY_KEY, LOCAL_HISTORY_LIMIT } from '@/lib/config/constants';
import type { ContentTypeId } from '@/lib/paste/content-type';

/**
 * Per-browser paste history.
 *
 * This is the whole "account system": the edit token proves ownership, and it
 * lives only here. Nothing in this module is ever transmitted except the token
 * itself, and only on an explicit edit or delete request.
 */
export type HistoryEntry = {
  slug: string;
  title: string | null;
  language: string;
  /**
   * Optional: entries written before content types existed have none. Absent
   * is treated the same as 'code' by anything that reads this field.
   */
  contentType?: ContentTypeId;
  createdAt: string;
  expiresAt: string | null;
  isEncrypted: boolean;
  burnAfterRead: boolean;
  isPasswordProtected: boolean;
  /** Raw edit token. Present only for pastes created in this browser. */
  editToken?: string;
  /**
   * Encryption key for browser-encrypted pastes, so "Recent" can rebuild a
   * working link. Same trust boundary as the token: local storage only.
   */
  encryptionKey?: string;
};

const listeners = new Set<() => void>();

/**
 * Cached snapshot. useSyncExternalStore compares snapshots by identity, so
 * handing it a freshly parsed array on every render would loop forever. The
 * cache is dropped whenever the underlying storage changes.
 */
let snapshot: HistoryEntry[] | null = null;

function invalidate(): void {
  snapshot = null;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readRaw(): HistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as HistoryEntry).slug === 'string',
    );
  } catch {
    // Corrupt or unavailable storage must never break the page.
    return [];
  }
}

function writeRaw(entries: HistoryEntry[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(entries.slice(0, LOCAL_HISTORY_LIMIT)));
  } catch {
    // Quota or private-mode failure: history is a convenience, not a guarantee.
  }
  invalidate();
  for (const listener of listeners) listener();
}

/** Stable snapshot for useSyncExternalStore. */
export function listHistory(): HistoryEntry[] {
  if (snapshot === null) snapshot = readRaw();
  return snapshot;
}

export function getHistoryEntry(slug: string): HistoryEntry | null {
  return readRaw().find((entry) => entry.slug === slug) ?? null;
}

export function getEditToken(slug: string): string | null {
  return getHistoryEntry(slug)?.editToken ?? null;
}

export function rememberPaste(entry: HistoryEntry): void {
  const existing = readRaw().filter((item) => item.slug !== entry.slug);
  writeRaw([entry, ...existing]);
}

export function updateHistoryEntry(slug: string, patch: Partial<HistoryEntry>): void {
  const entries = readRaw();
  const index = entries.findIndex((entry) => entry.slug === slug);
  if (index === -1) return;
  const current = entries[index];
  if (!current) return;
  entries[index] = { ...current, ...patch };
  writeRaw(entries);
}

export function forgetPaste(slug: string): void {
  writeRaw(readRaw().filter((entry) => entry.slug !== slug));
}

export function clearHistory(): void {
  writeRaw([]);
}

/** Subscribe to history changes — used by useSyncExternalStore in the UI. */
export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  // Keep other tabs of the same browser in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCAL_HISTORY_KEY) return;
    invalidate();
    listener();
  };
  if (isBrowser()) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (isBrowser()) window.removeEventListener('storage', onStorage);
  };
}
