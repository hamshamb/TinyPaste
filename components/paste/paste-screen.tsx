'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  Flame,
  GitFork,
  KeyRound,
  Link2,
  Lock,
  Pencil,
  QrCode as QrIcon,
  Trash2,
} from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { CodeBlock } from '@/components/paste/code-block';
import { CreateSuccess } from '@/components/paste/create-success';
import { PasswordGate } from '@/components/paste/password-gate';
import { BurnGate } from '@/components/paste/burn-gate';
import { DeletePasteDialog } from '@/components/paste/delete-dialog';
import { QrCode } from '@/components/paste/qr-code';
import { ExpiryTime, RelativeTime } from '@/components/ui/time';
import { useToast } from '@/components/ui/toast';
import { decryptPayload } from '@/lib/crypto/client';
import { buildFragment, buildShareUrl, readKeyFromHash } from '@/lib/crypto/fragment';
import { ApiError, deletePaste as deletePasteRequest } from '@/lib/client/api';
import { copyText, downloadText } from '@/lib/client/clipboard';
import { forgetPaste, getHistoryEntry, subscribeHistory } from '@/lib/client/history';
import { seedFork } from '@/lib/client/fork';
import { buildDownloadFilename } from '@/lib/utils/filename';
import { languageLabel } from '@/lib/paste/languages';
import { formatBytes } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';
import type { PasteContent, PasteMetadata } from '@/types/paste';

type Gate = 'none' | 'password' | 'burn';

/** Stable snapshot of the fragment key for useSyncExternalStore. */
function readCurrentHashKey(): string | null {
  return typeof window === 'undefined' ? null : readKeyFromHash(window.location.hash);
}

function subscribeHash(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

type PasteScreenProps = {
  meta: PasteMetadata;
  /** Body delivered by the server when no gate applies. */
  initialBody: PasteContent | null;
  gate: Gate;
  created: boolean;
};

type DecryptState = 'idle' | 'decrypting' | 'ready' | 'missing-key' | 'failed';

export function PasteScreen({ meta: initialMeta, initialBody, gate, created }: PasteScreenProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [meta, setMeta] = useState(initialMeta);
  const [body, setBody] = useState<PasteContent | null>(initialBody);
  const [plaintext, setPlaintext] = useState<string | null>(
    initialBody?.kind === 'plaintext' ? initialBody.content : null,
  );
  const [decryptState, setDecryptState] = useState<DecryptState>(
    initialBody?.kind === 'encrypted' ? 'decrypting' : 'ready',
  );
  const [burned, setBurned] = useState(false);
  const [rawView, setRawView] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ownership comes from this browser's local store, and is only a UI hint —
  // the server re-verifies the token on every edit and delete.
  const editToken = useSyncExternalStore(
    subscribeHistory,
    () => getHistoryEntry(initialMeta.slug)?.editToken ?? null,
    () => null,
  );

  // The key is read from the fragment, which the browser never sends anywhere.
  const encryptionKey = useSyncExternalStore(subscribeHash, readCurrentHashKey, () => null);

  useEffect(() => {
    if (body?.kind !== 'encrypted') return;
    let cancelled = false;

    const run = async () => {
      const key = readCurrentHashKey();
      if (!key) {
        if (!cancelled) setDecryptState('missing-key');
        return;
      }
      try {
        const text = await decryptPayload(
          { ciphertext: body.ciphertext, iv: body.iv, encryptionVersion: body.encryptionVersion },
          key,
        );
        if (cancelled) return;
        setPlaintext(text);
        setDecryptState('ready');
      } catch {
        // A wrong key, a tampered ciphertext and an unsupported version all
        // land here. AES-GCM cannot distinguish them, and the message stays
        // generic on purpose.
        if (!cancelled) setDecryptState('failed');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [body]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/p/${meta.slug}`;
    return buildShareUrl(window.location.origin, meta.slug, meta.isEncrypted ? encryptionKey : null);
  }, [meta.slug, meta.isEncrypted, encryptionKey]);

  const filename = buildDownloadFilename(meta.title, meta.language, meta.slug);

  /**
   * The edit screen decrypts and re-encrypts locally, so an encrypted paste's
   * edit link must carry the fragment key — without it the form has no way to
   * read the ciphertext it is meant to modify.
   */
  const editHref =
    meta.isEncrypted && encryptionKey
      ? `/p/${meta.slug}/edit#${buildFragment(encryptionKey)}`
      : `/p/${meta.slug}/edit`;

  /** Server-side raw/download are only possible when no secret is involved. */
  const serverExportable = !meta.isEncrypted && !meta.isPasswordProtected && !meta.burnAfterRead;

  const onGateResolved = (payload: { meta: PasteMetadata; body: PasteContent; burned: boolean }) => {
    setMeta(payload.meta);
    setBody(payload.body);
    setBurned(payload.burned);
    if (payload.body.kind === 'plaintext') {
      setPlaintext(payload.body.content);
      setDecryptState('ready');
    }
  };

  const copyContent = useCallback(async () => {
    if (plaintext === null) return;
    // Always the original text — never the highlighted markup.
    if (await copyText(plaintext)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
      toast('Copied', 'success');
    } else {
      toast('Could not copy', 'error');
    }
  }, [plaintext, toast]);

  const copyLink = async () => {
    if (await copyText(shareUrl)) {
      toast(meta.isEncrypted ? 'Encrypted link copied' : 'Link copied', 'success');
    } else {
      toast('Could not copy the link', 'error');
    }
  };

  const download = () => {
    if (plaintext === null) return;
    downloadText(filename, plaintext);
    toast('Download started', 'success');
  };

  const fork = () => {
    if (plaintext === null) return;
    if (seedFork({ content: plaintext, language: meta.language, title: meta.title })) {
      router.push('/');
    } else {
      toast('Could not open a fork in this browser', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!editToken) return;
    setDeleting(true);
    try {
      await deletePasteRequest(meta.slug, editToken);
      forgetPaste(meta.slug);
      toast('Paste deleted', 'success');
      router.push('/?deleted=1');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not delete this paste.', 'error');
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  // Ctrl/Cmd+Shift+C copies the paste body while viewing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copyContent();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copyContent]);

  const heading = meta.title ?? 'Untitled paste';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {created ? <CreateSuccess meta={meta} shareUrl={shareUrl} /> : null}

      {burned ? (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <Flame aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This paste has now been destroyed. This is the only copy — save it before you leave the page.
        </p>
      ) : null}

      <header className="mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words font-mono text-lg font-semibold tracking-tight">{heading}</h1>
          {meta.isEncrypted ? <Badge icon={Lock}>Encrypted</Badge> : null}
          {meta.isPasswordProtected ? <Badge icon={KeyRound}>Password</Badge> : null}
          {meta.burnAfterRead ? <Badge icon={Flame}>Burn after reading</Badge> : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span>{languageLabel(meta.language)}</span>
          <span aria-hidden>·</span>
          <RelativeTime iso={meta.createdAt} prefix="Created " />
          <span aria-hidden>·</span>
          <ExpiryTime expiresAt={meta.expiresAt} />
          {!meta.isEncrypted ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatBytes(meta.contentSize)}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Eye aria-hidden className="h-3 w-3" />
            {meta.views.toLocaleString()} {meta.views === 1 ? 'view' : 'views'}
          </span>
        </p>
      </header>

      {gate === 'password' && plaintext === null ? (
        <PasswordGate slug={meta.slug} burnAfterRead={meta.burnAfterRead} onUnlocked={onGateResolved} />
      ) : gate === 'burn' && body === null ? (
        <BurnGate slug={meta.slug} isCreator={created || editToken !== null} onRevealed={onGateResolved} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={copyContent} disabled={plaintext === null}>
              {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>

            {serverExportable ? (
              <LinkButton size="sm" href={`/p/${meta.slug}/raw`}>
                <FileText aria-hidden className="h-3.5 w-3.5" />
                Raw
              </LinkButton>
            ) : (
              <Button
                size="sm"
                onClick={() => setRawView((raw) => !raw)}
                aria-pressed={rawView}
                disabled={plaintext === null}
              >
                <FileText aria-hidden className="h-3.5 w-3.5" />
                {rawView ? 'Highlighted' : 'Raw'}
              </Button>
            )}

            {serverExportable ? (
              <LinkButton size="sm" href={`/p/${meta.slug}/download`}>
                <Download aria-hidden className="h-3.5 w-3.5" />
                Download
              </LinkButton>
            ) : (
              <Button size="sm" onClick={download} disabled={plaintext === null}>
                <Download aria-hidden className="h-3.5 w-3.5" />
                Download
              </Button>
            )}

            <Button size="sm" onClick={fork} disabled={plaintext === null}>
              <GitFork aria-hidden className="h-3.5 w-3.5" />
              Fork
            </Button>

            <Button size="sm" onClick={copyLink}>
              <Link2 aria-hidden className="h-3.5 w-3.5" />
              Copy link
            </Button>

            <Button size="sm" onClick={() => setShowQr((open) => !open)} aria-expanded={showQr} aria-controls="paste-qr">
              <QrIcon aria-hidden className="h-3.5 w-3.5" />
              QR
            </Button>

            {editToken && !meta.burnAfterRead ? (
              <LinkButton size="sm" href={editHref} className="ml-auto">
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                Edit
              </LinkButton>
            ) : null}
            {editToken ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                className={cn(!meta.burnAfterRead ? '' : 'ml-auto')}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
          </div>

          <div id="paste-qr" hidden={!showQr} className="mb-3 flex justify-center">
            <QrCode value={shareUrl} />
          </div>

          <div className="overflow-hidden rounded-lg border border-border-base bg-surface">
            {plaintext !== null ? (
              <CodeBlock code={plaintext} language={meta.language} plain={rawView} />
            ) : (
              <DecryptStatus state={decryptState} />
            )}
          </div>

          {meta.isEncrypted && decryptState === 'ready' ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-text-subtle">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Decrypted in your browser. The key lives after <code className="font-mono">#</code> in the URL
              and is never stored by us.
            </p>
          ) : null}
        </>
      )}

      <DeletePasteDialog
        open={deleteOpen}
        deleting={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Badge({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-base bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-text-muted">
      <Icon aria-hidden className="h-3 w-3" />
      {children}
    </span>
  );
}

function DecryptStatus({ state }: { state: DecryptState }) {
  if (state === 'decrypting') {
    return <p className="p-8 text-center text-sm text-text-muted">Decrypting in your browser…</p>;
  }
  const message =
    state === 'missing-key'
      ? 'Encryption key missing from this URL.'
      : state === 'failed'
        ? 'Unable to decrypt this paste.'
        : 'This paste is not available.';
  const detail =
    state === 'missing-key'
      ? 'The key is the part of the link after #. Make sure you opened the complete URL you were given.'
      : 'The key in this URL does not match this paste, or the stored data is damaged.';

  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      <AlertTriangle aria-hidden className="h-5 w-5 text-warning" />
      <p className="text-sm font-medium">{message}</p>
      <p className="max-w-sm text-xs text-text-muted">{detail}</p>
    </div>
  );
}
