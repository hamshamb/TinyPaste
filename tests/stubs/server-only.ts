/**
 * Test stub for the `server-only` package.
 *
 * In a Next.js build `server-only` resolves to an empty module under the
 * `react-server` condition and throws everywhere else, which is exactly the
 * guard we want in the app. Vitest has no such condition, so the real module
 * would throw while unit-testing server code. This stub restores the empty
 * build-time behaviour without weakening the guard in the application itself.
 */
export {};
