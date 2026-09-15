import type { NextConfig } from 'next';
import { exportRouteHeaders, securityHeaders } from './lib/security/headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders() },
      /**
       * Raw and download responses carry attacker-supplied bytes, so they get a
       * far stricter policy than the app shell. This entry comes second on
       * purpose: for a header key set by more than one matching rule, the later
       * rule wins, so it replaces the app's Content-Security-Policy rather than
       * sitting alongside it.
       */
      { source: '/p/:slug/raw', headers: exportRouteHeaders() },
      { source: '/p/:slug/download', headers: exportRouteHeaders() },
    ];
  },
};

export default nextConfig;
