import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * E2E runs against the in-memory repository so the suite needs no Supabase
 * project. TINYPASTE_ALLOW_MEMORY_DB opts in explicitly (see lib/db/index.ts).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          TINYPASTE_DB_DRIVER: 'memory',
          TINYPASTE_ALLOW_MEMORY_DB: 'true',
          TINYPASTE_DEV_DB_FILE: '',
          APP_URL: baseURL,
          // The whole suite runs from one address and creates far more pastes
          // per minute than a human would. The limiter's own behaviour is
          // covered by tests/unit/security.test.ts.
          RATE_LIMIT_CREATE: '1000',
          RATE_LIMIT_UNLOCK: '1000',
          RATE_LIMIT_MUTATE: '1000',
        },
      },
});
