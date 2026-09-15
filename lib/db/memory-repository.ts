import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NewPasteRecord, PasteRecord, PasteUpdate } from '@/types/paste';
import { isExpired } from '@/lib/paste/expiration';
import type { BurnedContent, PasteRepository } from './repository';

/**
 * Development / test store. Data is volatile and process-local — it exists so
 * the whole application (including E2E) is runnable without a Supabase project.
 * lib/db/index.ts refuses to select it in production unless explicitly allowed.
 *
 * Burn-after-read is atomic here for free: Node runs the claim synchronously on
 * a single thread, so no interleaving is possible between the check and the wipe.
 */
export class MemoryPasteRepository implements PasteRepository {
  readonly driver = 'memory' as const;
  private readonly rows = new Map<string, PasteRecord>();
  private readonly snapshotPath: string | undefined;

  constructor(snapshotPath?: string) {
    this.snapshotPath = snapshotPath;
    this.restore();
  }

  private restore(): void {
    if (!this.snapshotPath || !existsSync(this.snapshotPath)) return;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.snapshotPath, 'utf8'));
      if (!Array.isArray(parsed)) return;
      for (const row of parsed as PasteRecord[]) {
        if (row && typeof row.slug === 'string') this.rows.set(row.slug, row);
      }
    } catch {
      // A corrupt dev snapshot is never fatal — start from an empty store.
    }
  }

  private persist(): void {
    if (!this.snapshotPath) return;
    try {
      mkdirSync(dirname(this.snapshotPath), { recursive: true });
      writeFileSync(this.snapshotPath, JSON.stringify([...this.rows.values()]), 'utf8');
    } catch {
      // Best effort only.
    }
  }

  async create(record: NewPasteRecord): Promise<PasteRecord | null> {
    if (this.rows.has(record.slug)) return null;
    const now = new Date().toISOString();
    const row: PasteRecord = { ...record, id: randomUUID(), views: 0, burnedAt: null, updatedAt: now };
    this.rows.set(row.slug, row);
    this.persist();
    return { ...row };
  }

  async findBySlug(slug: string): Promise<PasteRecord | null> {
    const row = this.rows.get(slug);
    return row ? { ...row } : null;
  }

  async update(slug: string, patch: PasteUpdate): Promise<PasteRecord | null> {
    const row = this.rows.get(slug);
    if (!row) return null;
    const next: PasteRecord = { ...row, ...patch, updatedAt: new Date().toISOString() };
    this.rows.set(slug, next);
    this.persist();
    return { ...next };
  }

  async delete(slug: string): Promise<boolean> {
    const deleted = this.rows.delete(slug);
    if (deleted) this.persist();
    return deleted;
  }

  async consumeBurn(slug: string): Promise<BurnedContent | null> {
    const row = this.rows.get(slug);
    if (!row || !row.burnAfterRead || row.burnedAt !== null) return null;
    const captured: BurnedContent = {
      content: row.content,
      encryptedContent: row.encryptedContent,
      encryptionIv: row.encryptionIv,
      encryptionVersion: row.encryptionVersion,
    };
    this.rows.set(slug, {
      ...row,
      burnedAt: new Date().toISOString(),
      content: null,
      encryptedContent: null,
      encryptionIv: null,
      views: row.views + 1,
    });
    this.persist();
    return captured;
  }

  async incrementViews(slug: string): Promise<void> {
    const row = this.rows.get(slug);
    if (!row) return;
    this.rows.set(slug, { ...row, views: row.views + 1 });
    this.persist();
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    let count = 0;
    for (const [slug, row] of this.rows) {
      if (isExpired(row.expiresAt, now)) {
        this.rows.delete(slug);
        count += 1;
      }
    }
    if (count > 0) this.persist();
    return count;
  }

  /** Test helper. */
  clear(): void {
    this.rows.clear();
    this.persist();
  }
}
