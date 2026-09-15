/**
 * Shared by the client fetch layer and the server guards, so it lives in its own
 * module — importing it must not pull server-only code (env access, the rate
 * limiter, the database client) into the browser bundle.
 *
 * Edit tokens travel in a header rather than the URL so they never land in
 * browser history, a Referer header, or a server access log.
 */
export const EDIT_TOKEN_HEADER = 'x-tinypaste-edit-token';
