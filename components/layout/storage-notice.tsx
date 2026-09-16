import { AlertTriangle } from 'lucide-react';

/**
 * Shown whenever the volatile in-memory store is active, so a development or
 * demo instance can never be mistaken for durable storage.
 */
export function StorageNotice() {
  return (
    <div
      role="status"
      className="border-b border-warning-line bg-warning-soft px-4 py-1.5 text-center text-xs text-warning"
    >
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
        Temporary storage: no database is configured, so pastes are kept in memory and disappear when the
        server restarts.
      </span>
    </div>
  );
}
