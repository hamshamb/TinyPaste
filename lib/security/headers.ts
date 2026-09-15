/**
 * Security headers applied to every response by next.config.ts.
 *
 * The CSP is deliberately strict but Next.js compatible:
 *  - `'unsafe-inline'` on script-src is required by the App Router's inline
 *    bootstrap and flight payload scripts. A nonce-based policy would need
 *    middleware on every request; documented as a known limitation.
 *  - `'unsafe-inline'` on style-src covers Tailwind's inline critical CSS and
 *    the inline token colours emitted by the syntax highlighter.
 *  - No `object-src`, no `frame-src`: pasted content can never load a plugin
 *    or an iframe, which removes a whole class of content-injection escapes.
 */
export function contentSecurityPolicy(isDev: boolean): string {
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'" // dev needs eval for React Refresh
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Same-origin API calls only; no third-party beacons, no analytics.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Policy for the raw and download routes.
 *
 * Those responses are the user's own bytes served back verbatim. `default-src
 * 'none'` plus `sandbox` means that even if a browser were talked into treating
 * the response as a document, it would have no origin, no scripts, no forms and
 * no network access. Combined with `nosniff` and a `text/plain` content type,
 * an HTML or SVG paste cannot execute anything.
 */
export function exportRouteHeaders(): Array<{ key: string; value: string }> {
  return [
    { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ];
}

export function securityHeaders(): Array<{ key: string; value: string }> {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(isDev) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    // Referrers would leak slugs to third parties; fragments never travel anyway.
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ];
}
