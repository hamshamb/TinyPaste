/**
 * Expiration is expressed as a small closed set of options so the server never
 * has to trust a client-supplied timestamp.
 */
export const EXPIRATION_OPTIONS = [
  { id: '10m', label: '10 minutes', seconds: 10 * 60 },
  { id: '1h', label: '1 hour', seconds: 60 * 60 },
  { id: '1d', label: '1 day', seconds: 24 * 60 * 60 },
  { id: '7d', label: '7 days', seconds: 7 * 24 * 60 * 60 },
  { id: '30d', label: '30 days', seconds: 30 * 24 * 60 * 60 },
  { id: 'never', label: 'Never', seconds: null },
] as const;

export type ExpirationId = (typeof EXPIRATION_OPTIONS)[number]['id'];

export const DEFAULT_EXPIRATION: ExpirationId = '7d';

const EXPIRATION_MAP = new Map<string, (typeof EXPIRATION_OPTIONS)[number]>(
  EXPIRATION_OPTIONS.map((o) => [o.id, o]),
);

export const EXPIRATION_IDS: readonly ExpirationId[] = EXPIRATION_OPTIONS.map((o) => o.id);

export function isExpirationId(value: unknown): value is ExpirationId {
  return typeof value === 'string' && EXPIRATION_MAP.has(value);
}

/**
 * Resolve an expiration option into an absolute UTC instant.
 * Returns null for "never".
 */
export function resolveExpiresAt(id: ExpirationId, now: Date = new Date()): Date | null {
  const option = EXPIRATION_MAP.get(id);
  if (!option || option.seconds === null) return null;
  return new Date(now.getTime() + option.seconds * 1000);
}

/**
 * Central expiry predicate. Every read path funnels through this so no route
 * can accidentally skip the check.
 */
export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const at = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}

/** Best-effort reverse mapping, used to preselect the current value when editing. */
export function expirationIdFromDates(
  createdAt: Date | string,
  expiresAt: Date | string | null,
): ExpirationId {
  if (!expiresAt) return 'never';
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const expires = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const seconds = Math.round((expires.getTime() - created.getTime()) / 1000);
  let best: ExpirationId = '30d';
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const option of EXPIRATION_OPTIONS) {
    if (option.seconds === null) continue;
    const delta = Math.abs(option.seconds - seconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option.id;
    }
  }
  return best;
}
