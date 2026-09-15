import 'server-only';
/** Server-only environment access. Nothing here may be imported by a client component. */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  get supabaseUrl() {
    return optional('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return optional('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  /** Server-side only. Must never be referenced from a client bundle. */
  get supabaseServiceRoleKey() {
    return optional('SUPABASE_SERVICE_ROLE_KEY');
  },
  get appUrl() {
    return optional('APP_URL');
  },
  get rateLimitRedisUrl() {
    return optional('RATE_LIMIT_REDIS_URL');
  },
  get rateLimitRedisToken() {
    return optional('RATE_LIMIT_REDIS_TOKEN');
  },
  get abuseContactEmail() {
    return optional('ABUSE_CONTACT_EMAIL');
  },
  /** 'supabase' | 'memory'. Auto-detected when unset. */
  get dbDriver() {
    return optional('TINYPASTE_DB_DRIVER');
  },
  /** Explicit opt-in required to run the volatile in-memory store. */
  get allowMemoryDb() {
    return optional('TINYPASTE_ALLOW_MEMORY_DB') === 'true';
  },
  /** Optional JSON snapshot path so dev data survives a server restart. */
  get devDbFile() {
    return optional('TINYPASTE_DEV_DB_FILE');
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;

export function hasSupabaseConfig(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
