'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Client error boundary. It shows the digest Next.js generates rather than the
 * error message, so an internal detail never reaches the page.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`ts=${new Date().toISOString()} level=error op=ui.render digest=${error.digest ?? 'none'}`);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-warning-line bg-warning-soft text-warning">
        <TriangleAlert aria-hidden className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <h1 className="text-[15px] font-semibold">Something went wrong.</h1>
      <p className="mt-2 text-[13px] text-text-muted">
        The page could not be displayed. Trying again usually helps.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-text-subtle">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-9 items-center rounded-md border border-border-base bg-surface px-3.5 text-[13px] font-medium tp-transition hover:border-border-strong hover:bg-surface-muted active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}
