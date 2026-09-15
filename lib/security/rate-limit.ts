import { env } from '@/lib/config/env';
import { logError } from './logger';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Policy per sensitive operation, overridable per deployment.
 *
 * The defaults suit a public instance. An operator running behind a shared NAT,
 * or a CI run that creates hundreds of pastes from one address, can raise them
 * without editing code.
 */
function limitFrom(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export const RATE_LIMITS: Record<'create' | 'unlock' | 'mutate', RateLimitRule> = {
  create: { limit: limitFrom('RATE_LIMIT_CREATE', 20), windowSeconds: 60 },
  unlock: { limit: limitFrom('RATE_LIMIT_UNLOCK', 10), windowSeconds: 300 },
  mutate: { limit: limitFrom('RATE_LIMIT_MUTATE', 30), windowSeconds: 60 },
};

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface RateLimiter {
  readonly kind: 'memory' | 'upstash';
  check(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

/**
 * Per-instance fixed-window counter.
 *
 * Adequate for a single server and for development, but serverless deployments
 * run many isolated instances, so the effective limit is multiplied by the
 * instance count. Configure Upstash in production — see docs/SECURITY.md.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly kind = 'memory' as const;
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    if (this.buckets.size > 10_000) this.sweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
      return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    const allowed = bucket.count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - bucket.count),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Upstash Redis over its REST API — no SDK dependency, works on serverless.
 * INCR + EXPIRE in one pipeline call keeps the window atomic across instances.
 */
export class UpstashRateLimiter implements RateLimiter {
  readonly kind = 'upstash' as const;
  private readonly fallback = new MemoryRateLimiter();

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const redisKey = `tinypaste:rl:${key}`;
    try {
      const response = await fetch(`${this.url.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, String(rule.windowSeconds), 'NX'],
          ['TTL', redisKey],
        ]),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
      const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
      const count = Number(payload[0]?.result ?? 0);
      const ttl = Number(payload[2]?.result ?? rule.windowSeconds);
      const allowed = count <= rule.limit;
      return {
        allowed,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: allowed ? 0 : Math.max(1, ttl > 0 ? ttl : rule.windowSeconds),
      };
    } catch (error) {
      // Never fail a request because the limiter is unreachable; degrade to the
      // local counter so the endpoint stays protected on this instance.
      logError('ratelimit.upstash', error);
      return this.fallback.check(key, rule);
    }
  }
}

const globalStore = globalThis as typeof globalThis & { __tinypasteRateLimiter?: RateLimiter };

export function getRateLimiter(): RateLimiter {
  if (!globalStore.__tinypasteRateLimiter) {
    const url = env.rateLimitRedisUrl;
    const token = env.rateLimitRedisToken;
    globalStore.__tinypasteRateLimiter =
      url && token ? new UpstashRateLimiter(url, token) : new MemoryRateLimiter();
  }
  return globalStore.__tinypasteRateLimiter;
}

export async function enforceRateLimit(
  action: RateLimitAction,
  identifier: string,
): Promise<RateLimitResult> {
  return getRateLimiter().check(`${action}:${identifier}`, RATE_LIMITS[action]);
}
