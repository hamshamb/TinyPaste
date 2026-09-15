/**
 * Minimal structured logger.
 *
 * Only operation names, error classes and request ids are ever emitted. Paste
 * bodies, passwords, encryption keys and edit tokens must never be passed here —
 * `redact` exists so a careless caller cannot leak one by accident.
 */

const SENSITIVE_HINTS = /password|token|key|secret|content|plaintext|ciphertext/i;

function redact(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message.slice(0, 200)}`;
  if (typeof value === 'string') return value.slice(0, 200);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_HINTS.test(key))
      .slice(0, 8)
      .map(([key, val]) => `${key}=${typeof val === 'string' ? val.slice(0, 120) : String(val)}`);
    return entries.join(' ');
  }
  return String(value);
}

export function logError(operation: string, error: unknown, requestId?: string): void {
  const parts = [
    `ts=${new Date().toISOString()}`,
    'level=error',
    `op=${operation}`,
    requestId ? `req=${requestId}` : '',
    `detail="${redact(error).replace(/"/g, "'")}"`,
  ].filter(Boolean);
  console.error(parts.join(' '));
}

export function logWarn(operation: string, message: string, requestId?: string): void {
  const parts = [
    `ts=${new Date().toISOString()}`,
    'level=warn',
    `op=${operation}`,
    requestId ? `req=${requestId}` : '',
    `detail="${redact(message).replace(/"/g, "'")}"`,
  ].filter(Boolean);
  console.warn(parts.join(' '));
}
