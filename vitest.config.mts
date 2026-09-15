import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Unit tests cover pure logic, the security primitives and the service layer —
 * all of which run in plain Node with Web Crypto. Component behaviour is
 * covered end to end by Playwright instead, so there is no jsdom or React
 * plugin here; add `@vitejs/plugin-react` and `jsdom` if that changes.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // See tests/stubs/server-only.ts for why this is aliased.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
  },
});
