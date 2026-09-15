import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRATION,
  EXPIRATION_IDS,
  expirationIdFromDates,
  isExpirationId,
  isExpired,
  resolveExpiresAt,
} from '@/lib/paste/expiration';

const NOW = new Date('2026-01-01T12:00:00.000Z');

describe('resolveExpiresAt', () => {
  it.each([
    ['10m', 10 * 60],
    ['1h', 60 * 60],
    ['1d', 24 * 60 * 60],
    ['7d', 7 * 24 * 60 * 60],
    ['30d', 30 * 24 * 60 * 60],
  ] as const)('offsets %s by the right number of seconds', (id, seconds) => {
    const result = resolveExpiresAt(id, NOW);
    expect(result).not.toBeNull();
    expect(result!.getTime() - NOW.getTime()).toBe(seconds * 1000);
  });

  it('returns null for never', () => {
    expect(resolveExpiresAt('never', NOW)).toBeNull();
  });

  it('covers every advertised option', () => {
    for (const id of EXPIRATION_IDS) {
      expect(() => resolveExpiresAt(id, NOW)).not.toThrow();
    }
  });

  it('has a default that is one of the options', () => {
    expect(isExpirationId(DEFAULT_EXPIRATION)).toBe(true);
  });
});

describe('isExpirationId', () => {
  it('accepts known ids and rejects everything else', () => {
    expect(isExpirationId('1h')).toBe(true);
    expect(isExpirationId('2h')).toBe(false);
    expect(isExpirationId('')).toBe(false);
    expect(isExpirationId(null)).toBe(false);
    expect(isExpirationId(3_600)).toBe(false);
  });
});

describe('isExpired', () => {
  it('treats null as never expiring', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });

  it('is false strictly before the expiry instant', () => {
    expect(isExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('is true at the exact expiry instant', () => {
    // Boundary belongs to "expired": a paste at its expiry time must not leak.
    expect(isExpired(new Date(NOW.getTime()), NOW)).toBe(true);
  });

  it('is true after the expiry instant', () => {
    expect(isExpired(new Date(NOW.getTime() - 1_000), NOW)).toBe(true);
  });

  it('accepts ISO strings', () => {
    expect(isExpired('2025-01-01T00:00:00.000Z', NOW)).toBe(true);
    expect(isExpired('2027-01-01T00:00:00.000Z', NOW)).toBe(false);
  });

  it('does not treat an unparseable value as expired', () => {
    // Failing open here would be wrong in the other direction — a malformed
    // timestamp should not silently destroy access to a paste.
    expect(isExpired('not-a-date', NOW)).toBe(false);
  });

  it('agrees with resolveExpiresAt at the end of a window', () => {
    const expires = resolveExpiresAt('10m', NOW)!;
    expect(isExpired(expires, new Date(NOW.getTime() + 9 * 60 * 1000))).toBe(false);
    expect(isExpired(expires, new Date(NOW.getTime() + 11 * 60 * 1000))).toBe(true);
  });
});

describe('expirationIdFromDates', () => {
  it('maps a null expiry to never', () => {
    expect(expirationIdFromDates(NOW, null)).toBe('never');
  });

  it('recovers the original option', () => {
    for (const id of ['10m', '1h', '1d', '7d', '30d'] as const) {
      const expires = resolveExpiresAt(id, NOW)!;
      expect(expirationIdFromDates(NOW, expires)).toBe(id);
    }
  });
});
