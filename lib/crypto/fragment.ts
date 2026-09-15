/**
 * The encryption key travels in the URL fragment. Browsers do not include the
 * fragment in requests, so it never reaches the server, any proxy, or an access
 * log. These helpers are the only place that reads or writes it.
 */

const KEY_PREFIX = 'k';

/** Build `#k:<key>`. Versioned prefix so the format can evolve. */
export function buildFragment(key: string): string {
  return `${KEY_PREFIX}:${key}`;
}

export function buildShareUrl(origin: string, slug: string, key?: string | null): string {
  const base = `${origin.replace(/\/+$/, '')}/p/${slug}`;
  return key ? `${base}#${buildFragment(key)}` : base;
}

/**
 * Extract the key from a location hash. Accepts both the prefixed form and a
 * bare key so older links keep working.
 */
export function readKeyFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const value = raw.startsWith(`${KEY_PREFIX}:`) ? raw.slice(KEY_PREFIX.length + 1) : raw;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Only base64url characters — anything else is not one of our keys.
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}
