'use client';

import { useState } from 'react';
import { Check, Copy, Flame, KeyRound, Link2, QrCode as QrIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QrCode } from '@/components/paste/qr-code';
import { useToast } from '@/components/ui/toast';
import { copyText } from '@/lib/client/clipboard';
import { formatExpiry } from '@/lib/utils/time';
import type { PasteMetadata } from '@/types/paste';

type CreateSuccessProps = {
  meta: PasteMetadata;
  /** Full share URL, including the `#key` fragment for encrypted pastes. */
  shareUrl: string;
};

/**
 * Shown once, immediately after creation. It is the only place the encrypted
 * link's fragment is highlighted as unrecoverable, because that is the single
 * moment the key still exists anywhere outside the URL bar.
 */
export function CreateSuccess({ meta, shareUrl }: CreateSuccessProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copyLink = async () => {
    // For encrypted pastes this deliberately copies the complete URL — a link
    // without the fragment is useless to the recipient.
    if (await copyText(shareUrl)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
      toast(meta.isEncrypted ? 'Encrypted link copied' : 'Link copied', 'success');
    } else {
      toast('Could not copy the link', 'error');
    }
  };

  return (
    <section
      aria-label="Paste created"
      className="mb-5 rounded-lg border border-success/30 bg-success-soft/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
          <Check aria-hidden className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-text-base">Paste created</h2>
        <span className="text-xs text-text-muted">
          {meta.expiresAt ? formatExpiry(meta.expiresAt) : 'Never expires'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-base bg-surface px-2.5 py-2">
          <Link2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span className="truncate font-mono text-xs" title={shareUrl}>
            {shareUrl}
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={copyLink} variant="primary">
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button onClick={() => setShowQr((open) => !open)} aria-expanded={showQr} aria-controls="share-qr">
            <QrIcon aria-hidden className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">QR</span>
          </Button>
        </div>
      </div>

      <div id="share-qr" hidden={!showQr} className="mt-3 flex justify-center">
        <QrCode value={shareUrl} />
      </div>

      {meta.isEncrypted ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
          <KeyRound aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Keep the complete URL, including everything after <code className="font-mono">#</code>. That part
            is the decryption key, it never reaches our server, and it cannot be recovered if lost.
          </span>
        </p>
      ) : null}

      {meta.burnAfterRead ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
          <Flame aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This paste burns after reading. Opening the link from another browser or device consumes it, so
            share it before revealing it yourself.
          </span>
        </p>
      ) : null}

      <p className="mt-3 text-xs text-text-subtle">
        An edit token for this paste was saved in this browser, which is how you can edit or delete it later.
        Clearing site data removes it permanently.
      </p>
    </section>
  );
}
