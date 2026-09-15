/**
 * Every client-visible failure is one of these codes. Keeping the set closed
 * means responses never leak internal detail or stack traces.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  INVALID_SLUG: 400,
  PASTE_TOO_LARGE: 413,
  PASSWORD_REQUIRED: 401,
  INVALID_PASSWORD: 401,
  EDIT_TOKEN_REQUIRED: 401,
  INVALID_EDIT_TOKEN: 403,
  EDIT_NOT_ALLOWED: 409,
  PASTE_NOT_FOUND: 404,
  PASTE_EXPIRED: 410,
  PASTE_BURNED: 410,
  RATE_LIMITED: 429,
  STORAGE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The submitted paste is not valid.',
  INVALID_SLUG: 'That paste link is not valid.',
  PASTE_TOO_LARGE: 'This paste is larger than the allowed limit.',
  PASSWORD_REQUIRED: 'This paste is password protected.',
  INVALID_PASSWORD: 'Incorrect password.',
  EDIT_TOKEN_REQUIRED: 'An edit token is required for this action.',
  INVALID_EDIT_TOKEN: 'This browser is not authorised to modify this paste.',
  EDIT_NOT_ALLOWED: 'This paste cannot be edited.',
  PASTE_NOT_FOUND: 'Paste not found.',
  PASTE_EXPIRED: 'This paste has expired.',
  PASTE_BURNED: 'This paste is no longer available.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
  STORAGE_UNAVAILABLE: 'Paste storage is not configured.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: string[];
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, options?: { message?: string; details?: string[]; retryAfterSeconds?: number }) {
    super(options?.message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options?.details;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: string[];
  };
};

export function toApiErrorBody(error: AppError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details?.length ? { details: error.details } : {}),
    },
  };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CODES;
}
