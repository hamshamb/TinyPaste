import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NewPasteRecord, PasteRecord, PasteUpdate } from '@/types/paste';
import type { LanguageId } from '@/lib/paste/languages';
import { logError } from '@/lib/security/logger';
import type { BurnedContent, PasteRepository } from './repository';

/** Shape of the `pastes` table. Mirrors supabase/migrations/0001_init.sql. */
type PasteRow = {
  id: string;
  slug: string;
  title: string | null;
  content: string | null;
  encrypted_content: string | null;
  encryption_iv: string | null;
  encryption_version: number | null;
  is_encrypted: boolean;
  language: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  password_hash: string | null;
  burn_after_read: boolean;
  burned_at: string | null;
  edit_token_hash: string;
  views: number;
  content_size: number;
};

const SELECT_COLUMNS =
  'id,slug,title,content,encrypted_content,encryption_iv,encryption_version,is_encrypted,language,created_at,updated_at,expires_at,password_hash,burn_after_read,burned_at,edit_token_hash,views,content_size';

/** Postgres unique-violation. Signals a slug collision so the caller can retry. */
const UNIQUE_VIOLATION = '23505';

function toRecord(row: PasteRow): PasteRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    encryptedContent: row.encrypted_content,
    encryptionIv: row.encryption_iv,
    encryptionVersion: row.encryption_version,
    isEncrypted: row.is_encrypted,
    language: row.language as LanguageId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    passwordHash: row.password_hash,
    burnAfterRead: row.burn_after_read,
    burnedAt: row.burned_at,
    editTokenHash: row.edit_token_hash,
    views: Number(row.views),
    contentSize: row.content_size,
  };
}

/**
 * Production storage. Uses the service-role key, so this module is server-only:
 * it must never be reachable from a client component. All access is through
 * PostgREST's parameterised query builder — no string-concatenated SQL.
 */
export class SupabasePasteRepository implements PasteRepository {
  readonly driver = 'supabase' as const;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'tinypaste' } },
    });
  }

  private table() {
    return this.client.from('pastes');
  }

  async create(record: NewPasteRecord): Promise<PasteRecord | null> {
    const { data, error } = await this.table()
      .insert({
        slug: record.slug,
        title: record.title,
        content: record.content,
        encrypted_content: record.encryptedContent,
        encryption_iv: record.encryptionIv,
        encryption_version: record.encryptionVersion,
        is_encrypted: record.isEncrypted,
        language: record.language,
        created_at: record.createdAt,
        expires_at: record.expiresAt,
        password_hash: record.passwordHash,
        burn_after_read: record.burnAfterRead,
        edit_token_hash: record.editTokenHash,
        content_size: record.contentSize,
      })
      .select(SELECT_COLUMNS)
      .single<PasteRow>();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      logError('paste.create', error);
      throw new Error('Failed to store paste.');
    }
    return toRecord(data);
  }

  async findBySlug(slug: string): Promise<PasteRecord | null> {
    const { data, error } = await this.table()
      .select(SELECT_COLUMNS)
      .eq('slug', slug)
      .maybeSingle<PasteRow>();
    if (error) {
      logError('paste.find', error);
      throw new Error('Failed to load paste.');
    }
    return data ? toRecord(data) : null;
  }

  async update(slug: string, patch: PasteUpdate): Promise<PasteRecord | null> {
    const { data, error } = await this.table()
      .update({
        title: patch.title,
        content: patch.content,
        encrypted_content: patch.encryptedContent,
        encryption_iv: patch.encryptionIv,
        encryption_version: patch.encryptionVersion,
        language: patch.language,
        expires_at: patch.expiresAt,
        content_size: patch.contentSize,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select(SELECT_COLUMNS)
      .maybeSingle<PasteRow>();
    if (error) {
      logError('paste.update', error);
      throw new Error('Failed to update paste.');
    }
    return data ? toRecord(data) : null;
  }

  async delete(slug: string): Promise<boolean> {
    const { data, error } = await this.table().delete().eq('slug', slug).select('slug');
    if (error) {
      logError('paste.delete', error);
      throw new Error('Failed to delete paste.');
    }
    return (data?.length ?? 0) > 0;
  }

  /**
   * Delegates to the `consume_burn_paste` SQL function. The claim happens inside
   * a single `UPDATE ... WHERE burned_at IS NULL` statement, so Postgres row
   * locking guarantees that only one of N concurrent readers gets the content.
   */
  async consumeBurn(slug: string): Promise<BurnedContent | null> {
    const { data, error } = await this.client.rpc('consume_burn_paste', { p_slug: slug });
    if (error) {
      logError('paste.burn', error);
      throw new Error('Failed to read paste.');
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const typed = row as {
      content: string | null;
      encrypted_content: string | null;
      encryption_iv: string | null;
      encryption_version: number | null;
    };
    return {
      content: typed.content,
      encryptedContent: typed.encrypted_content,
      encryptionIv: typed.encryption_iv,
      encryptionVersion: typed.encryption_version,
    };
  }

  async incrementViews(slug: string): Promise<void> {
    const { error } = await this.client.rpc('increment_paste_views', { p_slug: slug });
    // A failed view count must never break paste delivery.
    if (error) logError('paste.views', error);
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const { data, error } = await this.table()
      .delete()
      .not('expires_at', 'is', null)
      .lte('expires_at', now.toISOString())
      .select('slug');
    if (error) {
      logError('paste.cleanup', error);
      throw new Error('Failed to clean up expired pastes.');
    }
    return data?.length ?? 0;
  }
}
