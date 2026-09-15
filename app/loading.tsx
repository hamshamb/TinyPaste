export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-5 w-40 animate-pulse rounded bg-surface-muted" />
      <div className="mt-6 h-64 animate-pulse rounded-lg border border-border-base bg-surface-muted" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
