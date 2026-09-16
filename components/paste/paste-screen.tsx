'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  Flame,
  GitFork,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Pencil,
  QrCode as QrIcon,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { CodeBlock } from '@/components/paste/code-block';
import { DocumentRenderer } from '@/components/paste/document-renderer';
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
import { copyRichText, copyText, downloadText } from '@/lib/client/clipboard';
import { forgetPaste, getHistoryEntry, subscribeHistory } from '@/lib/client/history';
import { seedFork } from '@/lib/client/fork';
import { buildDownloadFilename } from '@/lib/utils/filename';
import { languageLabel } from '@/lib/paste/languages';
import { formatBytes } from '@/lib/utils/time';
import { parseDocumentJson, type TinyPasteDoc } from '@/lib/document/schema';
import { docToPlainText } from '@/lib/document/plain-text';
import { docToMarkdown } from '@/lib/document/markdown';
import { docToHtml } from '@/lib/document/html';
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

type DecryptState = 'idle' | 'decrypting' | 'ready' | 'missing-key' | 'failed' | 'invalid-document';

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

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
  const isDocument = meta.contentType === 'document';

  /**
   * `plaintext` is exactly what the server (or the decryption above) handed
   * back — for a document paste that string is JSON.stringify of the
   * document, not prose. Every write path validated it before storing it, so
   * a parse failure here should be unreachable; it fails into an explicit
   * error state rather than a crash or a code-block dump of raw JSON, on the
   * same "never trust it implicitly" principle as the write-time validator.
   */
  const documentResult = useMemo((): { doc: TinyPasteDoc } | { error: true } | null => {
    if (!isDocument || plaintext === null) return null;
    try {
      return { doc: parseDocumentJson(plaintext) };
    } catch {
      return { error: true };
    }
  }, [isDocument, plaintext]);
  const documentPlainText = useMemo(
    () => (documentResult && 'doc' in documentResult ? docToPlainText(documentResult.doc) : null),
    [documentResult],
  );

  /**
   * The edit screen decrypts and re-encrypts locally, so an encrypted paste's
   * edit link must carry the fragment key — without it the form has no way to
   * read the ciphertext it is meant to modify.
   */
  const editHref =
    meta.isEncrypted && encryptionKey
      ? `/p/${meta.slug}/edit#${buildFragment(encryptionKey)}`
      : `/p/${meta.slug}/edit`;

  /**
   * Server-side raw/download are only possible when no secret is involved,
   * and never for a document — its stored string is JSON, not something to
   * hand back as "the raw file"; see readPlaintextForExport in
   * lib/paste/service.ts, which refuses the same case at the API layer.
   */
  const serverExportable = !meta.isEncrypted && !meta.isPasswordProtected && !meta.burnAfterRead && !isDocument;

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
    // For a document, copy rich text with a plain-text fallback in the same
    // clipboard write, so pasting into a rich editor keeps the formatting.
    // Everything else copies its original source text, never highlighted markup.
    const ok =
      documentResult && 'doc' in documentResult
        ? await copyRichText(docToHtml(documentResult.doc), documentPlainText ?? '')
        : plaintext !== null
          ? await copyText(plaintext)
          : false;
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
      toast('Copied', 'success');
    } else {
      toast('Could not copy', 'error');
    }
  }, [documentPlainText, documentResult, plaintext, toast]);

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

  const exportDocument = (format: 'txt' | 'md' | 'html') => {
    if (!documentResult || !('doc' in documentResult)) return;
    const base = filename.replace(/\.[^.]+$/, '');
    if (format === 'txt') downloadText(`${base}.txt`, documentPlainText ?? '');
    else if (format === 'md') downloadText(`${base}.md`, docToMarkdown(documentResult.doc), 'text/markdown;charset=utf-8');
    else downloadText(`${base}.html`, docToHtml(documentResult.doc), 'text/html;charset=utf-8');
    toast('Download started', 'success');
  };

  const fork = () => {
    if (plaintext === null) return;
    // The original string is preserved exactly — JSON for a document paste,
    // so forking reopens Tiptap with the same structure rather than flattened text.
    if (seedFork({ content: plaintext, language: meta.language, contentType: meta.contentType, title: meta.title })) {
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
  const lineCount = !isDocument && plaintext !== null ? plaintext.split('\n').length : null;
  const documentWordCount = documentPlainText !== null ? wordCount(documentPlainText) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-5">
      {created ? <CreateSuccess meta={meta} shareUrl={shareUrl} /> : null}

      {burned ? (
        <p
          role="status"
          className="mb-3 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <Flame aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This paste has now been destroyed. This is the only copy — save it before you leave the page.
        </p>
      ) : null}

      <header className="mb-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-subtle">
          <Link href="/" className="rounded tp-transition hover:text-text-base">
            TinyPaste
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-text-muted">{meta.slug}</span>
        </nav>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h1 className="min-w-0 break-words text-[17px] font-semibold tracking-[-0.02em]">{heading}</h1>
          {meta.isEncrypted ? <Tag icon={Lock}>Encrypted</Tag> : null}
          {meta.isPasswordProtected ? <Tag icon={KeyRound}>Password</Tag> : null}
          {meta.burnAfterRead ? <Tag icon={Flame}>Burn after reading</Tag> : null}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
          <span>{isDocument ? 'Document' : languageLabel(meta.language)}</span>
          {lineCount !== null ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'}
              </span>
            </>
          ) : null}
          {documentWordCount !== null ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {documentWordCount.toLocaleString()} {documentWordCount === 1 ? 'word' : 'words'}
              </span>
            </>
          ) : null}
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
          <span className="inline-flex items-center gap-1 tabular-nums">
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
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <Button size="sm" onClick={copyContent} disabled={plaintext === null}>
              {copied ? (
                <Check aria-hidden className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy aria-hidden className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>

            {isDocument ? (
              <ExportMenu
                disabled={!documentResult || !('doc' in documentResult)}
                onExport={exportDocument}
              />
            ) : (
              <>
                {serverExportable ? (
                  <LinkButton size="sm" variant="ghost" href={`/p/${meta.slug}/raw`}>
                    <FileText aria-hidden className="h-3.5 w-3.5" />
                    Raw
                  </LinkButton>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRawView((raw) => !raw)}
                    aria-pressed={rawView}
                    disabled={plaintext === null}
                  >
                    <FileText aria-hidden className="h-3.5 w-3.5" />
                    {rawView ? 'Highlighted' : 'Raw'}
                  </Button>
                )}

                {serverExportable ? (
                  <LinkButton size="sm" variant="ghost" href={`/p/${meta.slug}/download`}>
                    <Download aria-hidden className="h-3.5 w-3.5" />
                    Download
                  </LinkButton>
                ) : (
                  <Button size="sm" variant="ghost" onClick={download} disabled={plaintext === null}>
                    <Download aria-hidden className="h-3.5 w-3.5" />
                    Download
                  </Button>
                )}
              </>
            )}

            <Button size="sm" variant="ghost" onClick={fork} disabled={plaintext === null}>
              <GitFork aria-hidden className="h-3.5 w-3.5" />
              Fork
            </Button>

            <span aria-hidden className="mx-0.5 hidden h-4 w-px bg-border-base sm:block" />

            <Button size="sm" variant="ghost" onClick={copyLink}>
              <Link2 aria-hidden className="h-3.5 w-3.5" />
              Copy link
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowQr((open) => !open)}
              aria-expanded={showQr}
              aria-controls="paste-qr"
            >
              <QrIcon aria-hidden className="h-3.5 w-3.5" />
              QR
            </Button>

            {editToken ? (
              <span className="ml-auto flex items-center gap-1">
                {!meta.burnAfterRead ? (
                  <LinkButton size="sm" variant="ghost" href={editHref}>
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                    Edit
                  </LinkButton>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteOpen(true)}
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </span>
            ) : null}
          </div>

          <div id="paste-qr" hidden={!showQr} className="mb-2 flex justify-center">
            <QrCode value={shareUrl} />
          </div>

          <div className="overflow-hidden rounded-xl border border-border-base bg-editor tp-shadow">
            {isDocument ? (
              documentResult ? (
                'doc' in documentResult ? (
                  <DocumentRenderer doc={documentResult.doc} />
                ) : (
                  <DecryptStatus state="invalid-document" />
                )
              ) : (
                <DecryptStatus state={decryptState} />
              )
            ) : plaintext !== null ? (
              <CodeBlock code={plaintext} language={meta.language} plain={rawView} />
            ) : (
              <DecryptStatus state={decryptState} />
            )}
          </div>

          {meta.isEncrypted && decryptState === 'ready' ? (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2} />
              <span className="font-medium text-text-muted">End-to-end encrypted</span>
              <span aria-hidden>·</span>
              <span>Decrypted locally in this browser</span>
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

/**
 * Document mode's stand-in for Raw/Download.
 *
 * There is no single "raw file" for a document the way there is for code —
 * see the comment on `serverExportable` above — so this offers the formats
 * that do make sense instead, generated locally from the same document the
 * page already rendered.
 */
function ExportMenu({ disabled, onExport }: { disabled: boolean; onExport: (format: 'txt' | 'md' | 'html') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
        Export
        <ChevronDown aria-hidden className="h-3 w-3" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-border-base bg-surface py-1 tp-shadow-pop tp-pop"
        >
          {(
            [
              { format: 'txt' as const, label: 'Plain text (.txt)', icon: FileText },
              { format: 'md' as const, label: 'Markdown (.md)', icon: FileCode },
              { format: 'html' as const, label: 'HTML (.html)', icon: FileCode },
            ]
          ).map(({ format, label, icon: Icon }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => {
                onExport(format);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text-muted tp-transition hover:bg-surface-muted hover:text-text-base"
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Tag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border-base bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
      <Icon aria-hidden className="h-3 w-3" strokeWidth={1.9} />
      {children}
    </span>
  );
}

function DecryptStatus({ state }: { state: DecryptState }) {
  if (state === 'decrypting') {
    return (
      <p className="flex items-center justify-center gap-2 p-10 text-sm text-text-muted">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Decrypting in your browser…
      </p>
    );
  }
  const message =
    state === 'missing-key'
      ? 'Encryption key missing from this URL.'
      : state === 'failed'
        ? 'Unable to decrypt this paste.'
        : state === 'invalid-document'
          ? 'This document could not be read.'
          : 'This paste is not available.';
  const detail =
    state === 'missing-key'
      ? 'The key is the part of the link after #. Make sure you opened the complete URL you were given.'
      : state === 'invalid-document'
        ? 'The stored content does not match the expected document format.'
        : 'The key in this URL does not match this paste, or the stored data is damaged.';

  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-warning-line bg-warning-soft text-warning">
        <AlertTriangle aria-hidden className="h-4 w-4" />
      </span>
      <p className="text-sm font-medium">{message}</p>
      <p className="max-w-sm text-xs text-text-muted">{detail}</p>
    </div>
  );
}
