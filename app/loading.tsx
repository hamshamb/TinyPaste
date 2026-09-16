export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-3 sm:px-5 sm:py-4"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Mirrors the editor shell, so the first paint has the shape of the real
          screen rather than a generic block. */}
      <div className="flex min-h-[60vh] flex-1 animate-pulse flex-col rounded-xl border border-border-base bg-editor">
        <div className="flex items-center gap-2 border-b border-border-base px-3 py-2.5">
          <div className="h-3.5 w-40 rounded bg-surface-muted" />
          <div className="ml-auto h-3.5 w-24 rounded bg-surface-muted" />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 border-t border-border-base px-3 py-2.5">
          <div className="h-3.5 w-24 rounded bg-surface-muted" />
          <div className="h-3.5 w-20 rounded bg-surface-muted" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
