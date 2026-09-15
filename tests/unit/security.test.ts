import { describe, expect, it } from 'vitest';
import { generateEditToken, hashEditToken, verifyEditToken } from '@/lib/security/tokens';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import { isSameOrigin, clientIdentifier } from '@/lib/security/request';
import { MemoryRateLimiter } from '@/lib/security/rate-limit';
import { contentSecurityPolicy, securityHeaders } from '@/lib/security/headers';
import { EDIT_TOKEN_BYTES } from '@/lib/config/constants';

describe('edit tokens', () => {
  it('generates tokens with at least 256 bits of entropy', () => {
    const token = generateEditToken();
    // base64url of 32 bytes, unpadded.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(Math.ceil((EDIT_TOKEN_BYTES * 4) / 3) - 2);
  });

  it('never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) seen.add(generateEditToken());
    expect(seen.size).toBe(1_000);
  });

  it('hashes to a fixed-width hex digest that is not the token', () => {
    const token = generateEditToken();
    const hash = hashEditToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('is deterministic for the same token', () => {
    const token = generateEditToken();
    expect(hashEditToken(token)).toBe(hashEditToken(token));
  });

  it('verifies a matching token', () => {
    const token = generateEditToken();
    expect(verifyEditToken(token, hashEditToken(token))).toBe(true);
  });

  it('rejects a different token', () => {
    const hash = hashEditToken(generateEditToken());
    expect(verifyEditToken(generateEditToken(), hash)).toBe(false);
  });

  it('rejects a token that only shares a prefix', () => {
    const token = generateEditToken();
    const hash = hashEditToken(token);
    expect(verifyEditToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), hash)).toBe(false);
  });

  it('rejects missing or malformed input without throwing', () => {
    const hash = hashEditToken(generateEditToken());
    expect(verifyEditToken(null, hash)).toBe(false);
    expect(verifyEditToken(undefined, hash)).toBe(false);
    expect(verifyEditToken('', hash)).toBe(false);
    expect(verifyEditToken('token', null)).toBe(false);
    expect(verifyEditToken('token', '')).toBe(false);
    expect(verifyEditToken('token', 'not-hex')).toBe(false);
    expect(verifyEditToken('token', 'ab')).toBe(false);
  });
});

describe('passwords', () => {
  it('produces a bcrypt hash that is not the password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('s3cret-paste');
    expect(await verifyPassword('s3cret-paste', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-paste');
    expect(await verifyPassword('s3cret-pastE', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await verifyPassword('s3cret-past', hash)).toBe(false);
  });

  it('rejects rather than throws for a missing or malformed hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-bcrypt-hash')).toBe(false);
  });

  it('preserves unicode passwords exactly', async () => {
    const password = 'пароль-🔐-ünïcode';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('пароль-🔐-unicode', hash)).toBe(false);
  });
});

describe('same-origin guard', () => {
  const url = 'https://tinypaste.example/api/pastes';

  it('accepts a matching Origin', () => {
    const request = new Request(url, { headers: { origin: 'https://tinypaste.example' } });
    expect(isSameOrigin(request)).toBe(true);
  });

  it('rejects a foreign Origin', () => {
    const request = new Request(url, { headers: { origin: 'https://evil.example' } });
    expect(isSameOrigin(request)).toBe(false);
  });

  it('rejects a lookalike subdomain', () => {
    const request = new Request(url, { headers: { origin: 'https://tinypaste.example.evil.com' } });
    expect(isSameOrigin(request)).toBe(false);
  });

  it('rejects a malformed Origin', () => {
    const request = new Request(url, { headers: { origin: 'not a url' } });
    expect(isSameOrigin(request)).toBe(false);
  });

  it('allows a request with no Origin — non-browser clients carry no ambient credentials', () => {
    expect(isSameOrigin(new Request(url))).toBe(true);
  });

  it('honours x-forwarded-host when a proxy rewrites the host', () => {
    const request = new Request('https://internal.vercel.app/api/pastes', {
      headers: { origin: 'https://tinypaste.example', 'x-forwarded-host': 'tinypaste.example' },
    });
    expect(isSameOrigin(request)).toBe(true);
  });
});

describe('clientIdentifier', () => {
  it('uses the first x-forwarded-for entry', () => {
    const request = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' },
    });
    expect(clientIdentifier(request)).toBe('203.0.113.7');
  });

  it('falls back to a constant when no header is present', () => {
    expect(clientIdentifier(new Request('https://x.test'))).toBe('anonymous');
  });
});

describe('MemoryRateLimiter', () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it('allows up to the limit then blocks', async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.check('a', rule)).allowed).toBe(true);
    }
    const blocked = await limiter.check('a', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts each key independently', async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 3; i += 1) await limiter.check('a', rule);
    expect((await limiter.check('b', rule)).allowed).toBe(true);
  });

  it('reports a decreasing remaining budget', async () => {
    const limiter = new MemoryRateLimiter();
    expect((await limiter.check('c', rule)).remaining).toBe(2);
    expect((await limiter.check('c', rule)).remaining).toBe(1);
    expect((await limiter.check('c', rule)).remaining).toBe(0);
  });

  it('starts a new window once the old one lapses', async () => {
    const limiter = new MemoryRateLimiter();
    const instant = { limit: 1, windowSeconds: 0 };
    expect((await limiter.check('d', instant)).allowed).toBe(true);
    expect((await limiter.check('d', instant)).allowed).toBe(true);
  });
});

describe('security headers', () => {
  it('blocks plugins, framing and cross-origin connections', () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it('does not allow eval in production', () => {
    expect(contentSecurityPolicy(false)).not.toContain('unsafe-eval');
    // Dev needs it for React Refresh.
    expect(contentSecurityPolicy(true)).toContain('unsafe-eval');
  });

  it('sets the expected header set', () => {
    const keys = securityHeaders().map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    );
  });

  it('sends no referrer, so slugs do not leak to third parties', () => {
    const referrer = securityHeaders().find((header) => header.key === 'Referrer-Policy');
    expect(referrer?.value).toBe('no-referrer');
  });
});
