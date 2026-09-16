'use client';

import { useState } from 'react';
import { Check, Copy, Flame, KeyRound, QrCode as QrIcon } from 'lucide-react';
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
 * Shown once, immediately after creation.
 *
 * It is the only place the encrypted link's fragment is called out as
 * unrecoverable, because that is the single moment the key still exists
 * anywhere outside the URL bar — which is why that one line is allowed to be a
 * warning box when nothing else in the app is.
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
      className="mb-4 overflow-hidden rounded-xl border border-border-base bg-surface tp-shadow tp-rise"
    >
      <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
            <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold">Paste created</h2>
            <p className="truncate font-mono text-xs text-text-subtle" title={shareUrl}>
              {shareUrl}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden text-xs text-text-subtle sm:inline">
            {meta.expiresAt ? formatExpiry(meta.expiresAt) : 'Never expires'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowQr((open) => !open)}
            aria-expanded={showQr}
            aria-controls="share-qr"
          >
            <QrIcon aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only">QR</span>
          </Button>
          <Button onClick={copyLink} variant="primary" size="sm">
            {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </div>

      <div id="share-qr" hidden={!showQr} className="flex justify-center border-t border-border-base p-3">
        <QrCode value={shareUrl} />
      </div>

      {meta.isEncrypted || meta.burnAfterRead ? (
        <div className="flex flex-col gap-1.5 border-t border-border-base bg-warning-soft px-3 py-2 text-xs text-warning">
          {meta.isEncrypted ? (
            <p className="flex items-start gap-2">
              <KeyRound aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Keep the complete URL, including everything after <code className="font-mono">#</code>. That
                part is the decryption key, it never reaches our server, and it cannot be recovered if lost.
              </span>
            </p>
          ) : null}
          {meta.burnAfterRead ? (
            <p className="flex items-start gap-2">
              <Flame aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This paste burns after reading. Opening the link from another browser or device consumes it,
                so share it before revealing it yourself.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="border-t border-border-base px-3 py-2 text-[11px] text-text-subtle">
        An edit token for this paste was saved in this browser, which is how you can edit or delete it later.
        Clearing site data removes it permanently.
      </p>
    </section>
  );
}
