import { NextResponse } from 'next/server';
import { AppError, toApiErrorBody, type ErrorCode } from '@/lib/errors';
import { logError } from '@/lib/security/logger';
import { requestId } from '@/lib/security/request';

/** Paste responses must never be cached by a CDN or a shared proxy. */
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function jsonOk<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}

export function jsonError(error: AppError): NextResponse {
  const headers: Record<string, string> = { ...NO_STORE_HEADERS };
  if (error.retryAfterSeconds) headers['Retry-After'] = String(error.retryAfterSeconds);
  return NextResponse.json(toApiErrorBody(error), { status: error.status, headers });
}

export function errorFor(code: ErrorCode, message?: string): NextResponse {
  return jsonError(new AppError(code, message ? { message } : undefined));
}

/**
 * Convert any thrown value into a safe response.
 *
 * Unexpected errors are logged with an operation name and a request id only —
 * the client receives a generic message and never a stack trace.
 */
export function handleRouteError(operation: string, error: unknown): NextResponse {
  if (error instanceof AppError) return jsonError(error);
  const id = requestId();
  logError(operation, error, id);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', details: [`request:${id}`] } },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/** Parse a JSON body defensively — malformed input is a validation failure. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('VALIDATION_FAILED', { message: 'Request body must be valid JSON.' });
  }
}
