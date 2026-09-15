'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, unlockPaste } from '@/lib/client/api';
import type { PastePayload } from '@/types/paste';

type PasswordGateProps = {
  slug: string;
  burnAfterRead: boolean;
  onUnlocked: (payload: PastePayload) => void;
};

/**
 * Password prompt.
 *
 * No part of the protected paste is sent to this page before a successful
 * unlock — the server returns metadata only until the password verifies, so
 * there is nothing in the HTML to recover with devtools.
 */
export function PasswordGate({ slug, burnAfterRead, onUnlocked }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || password.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      onUnlocked(await unlockPaste(slug, password));
    } catch (caught) {
      // Wrong password, expired and burned all surface as their own message;
      // none of them reveal anything about the password itself.
      setError(caught instanceof ApiError ? caught.message : 'Could not unlock this paste.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-border-base bg-surface p-5 tp-shadow">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
          <KeyRound aria-hidden className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">This paste is password protected.</h2>
          <p className="text-xs text-text-muted">Enter the password to view its contents.</p>
        </div>
      </div>

      {burnAfterRead ? (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
          This paste also burns after reading. Unlocking it will consume it permanently.
        </p>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
          autoComplete="off"
          autoFocus
          disabled={submitting}
        />
        <Button type="submit" variant="primary" disabled={submitting || password.length === 0}>
          {submitting ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Checking password…
            </>
          ) : (
            'Unlock'
          )}
        </Button>
      </form>
    </div>
  );
}
