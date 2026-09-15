import 'server-only';
import { env, hasSupabaseConfig } from '@/lib/config/env';
import { AppError } from '@/lib/errors';
import { logWarn } from '@/lib/security/logger';
import { MemoryPasteRepository } from './memory-repository';
import { SupabasePasteRepository } from './supabase-repository';
import type { PasteRepository } from './repository';

/**
 * Cached on globalThis so Next.js dev hot-reloads (which re-evaluate modules)
 * do not discard the in-memory store or open redundant Supabase clients.
 */
const globalStore = globalThis as typeof globalThis & {
  __tinypasteRepository?: PasteRepository;
};

function build(): PasteRepository {
  const requested = env.dbDriver;

  if (requested === 'supabase' || (!requested && hasSupabaseConfig())) {
    const url = env.supabaseUrl;
    const key = env.supabaseServiceRoleKey;
    if (!url || !key) {
      throw new AppError('STORAGE_UNAVAILABLE', {
        message:
          'Supabase is selected but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.',
      });
    }
    return new SupabasePasteRepository(url, key);
  }

  /**
   * The volatile store must never silently become production storage. In a
   * production build it is only reachable behind an explicit opt-in flag.
   */
  if (env.isProduction && !env.allowMemoryDb) {
    throw new AppError('STORAGE_UNAVAILABLE', {
      message:
        'No database configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set TINYPASTE_ALLOW_MEMORY_DB=true to accept volatile storage.',
    });
  }

  logWarn(
    'db.init',
    'Using the in-memory paste store. Data is temporary and disappears when the server restarts.',
  );
  const snapshot = env.devDbFile ?? (env.isProduction ? undefined : '.data/pastes.json');
  return new MemoryPasteRepository(snapshot);
}

export function getRepository(): PasteRepository {
  if (!globalStore.__tinypasteRepository) {
    globalStore.__tinypasteRepository = build();
  }
  return globalStore.__tinypasteRepository;
}

/** True when the active store is volatile — the UI surfaces a banner for it. */
export function isUsingVolatileStorage(): boolean {
  try {
    return getRepository().driver === 'memory';
  } catch {
    return false;
  }
}

export type { PasteRepository };
export { MemoryPasteRepository, SupabasePasteRepository };
