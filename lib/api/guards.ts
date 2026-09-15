import 'server-only';
import { AppError } from '@/lib/errors';
import { enforceRateLimit, type RateLimitAction } from '@/lib/security/rate-limit';
import { clientIdentifier, isSameOrigin } from '@/lib/security/request';
import { EDIT_TOKEN_HEADER } from './edit-token';

export { EDIT_TOKEN_HEADER };

/**
 * Standard preamble for every state-changing route: reject cross-origin
 * submissions, then apply the per-action rate limit.
 */
export async function guardMutation(request: Request, action: RateLimitAction): Promise<void> {
  if (!isSameOrigin(request)) {
    throw new AppError('VALIDATION_FAILED', { message: 'Cross-origin requests are not accepted.' });
  }
  const result = await enforceRateLimit(action, clientIdentifier(request));
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', { retryAfterSeconds: result.retryAfterSeconds });
  }
}

export function readEditToken(request: Request, body?: unknown): string | null {
  const header = request.headers.get(EDIT_TOKEN_HEADER);
  if (header && header.trim().length > 0) return header.trim();
  if (body && typeof body === 'object' && 'editToken' in body) {
    const value = (body as { editToken?: unknown }).editToken;
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}
