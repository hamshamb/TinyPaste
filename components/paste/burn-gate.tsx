'use client';

import { useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, revealPaste } from '@/lib/client/api';
import type { PastePayload } from '@/types/paste';

type BurnGateProps = {
  slug: string;
  /** True when the current visitor just created this paste. */
  isCreator: boolean;
  onRevealed: (payload: PastePayload) => void;
};

/**
 * Explicit consent before a one-shot paste is consumed.
 *
 * Revealing is a POST triggered by a click, never something that happens while
 * the page renders. That is what stops a prefetch, a chat-app link preview or
 * the creator's own redirect after creation from destroying the paste before
 * the intended recipient ever opens it.
 */
export function BurnGate({ slug, isCreator, onRevealed }: BurnGateProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      onRevealed(await revealPaste(slug));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open this paste.');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-xl border border-border-base bg-surface p-5 tp-shadow">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-warning-line bg-warning-soft text-warning">
        <Flame aria-hidden className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <h2 className="mt-3 text-sm font-semibold">This paste burns after reading.</h2>
      <p className="mt-1 text-[13px] text-text-muted">
        Opening it destroys the stored copy permanently. Make sure you are ready to read it now.
      </p>

      {isCreator ? (
        <p className="mt-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning">
          You just created this paste, and opening it here would consume it before you can share it. Copy the
          link first — the recipient reveals it themselves.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}

      <Button onClick={reveal} variant="primary" size="lg" disabled={loading} className="mt-4 w-full">
        {loading ? (
          <>
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Opening…
          </>
        ) : (
          <>
            <Flame aria-hidden className="h-4 w-4" />
            Reveal and destroy
          </>
        )}
      </Button>
    </div>
  );
}
