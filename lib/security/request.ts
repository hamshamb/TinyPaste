import { randomBase64Url } from './random';

/**
 * Best-effort client identity for rate limiting.
 *
 * The IP is used transiently as a bucket key and is never persisted or logged.
 * Headers are attacker-controlled behind a misconfigured proxy, so this is a
 * speed bump, not an authentication mechanism.
 */
export function clientIdentifier(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  const candidate =
    forwarded?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-vercel-forwarded-for')?.trim();
  return candidate && candidate.length > 0 ? candidate : 'anonymous';
}

export function requestId(): string {
  return randomBase64Url(8);
}

/**
 * Same-origin check for state-changing requests.
 *
 * The API is only ever called by this app's own fetch() calls, which always send
 * an Origin header. Rejecting cross-origin Origins blocks the form-post and
 * simple-request shapes of CSRF; combined with `form-action 'self'` in the CSP
 * and the fact that no ambient cookie authenticates a mutation (edit tokens are
 * sent explicitly in the body), this is sufficient. See docs/SECURITY.md.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin means a non-browser client (curl, CLI). Those carry no ambient
    // credentials, so they are not a CSRF vector.
    return true;
  }
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    if (originUrl.host === requestUrl.host) return true;
    // Behind a proxy the internal request host can differ from the public one.
    const forwardedHost = request.headers.get('x-forwarded-host');
    return forwardedHost ? originUrl.host === forwardedHost : false;
  } catch {
    return false;
  }
}
