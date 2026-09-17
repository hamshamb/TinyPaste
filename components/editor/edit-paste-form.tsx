'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock, Save, ShieldAlert, Timer, WrapText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineSelect } from '@/components/ui/inline-select';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { Kbd, useModifierLabel } from '@/components/ui/kbd';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/components/theme-provider';
import { CodeEditor, type CursorPosition } from '@/components/editor/code-editor';
import { DocumentEditor } from '@/components/editor/document-editor';
import { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH } from '@/lib/config/constants';
import { EXPIRATION_OPTIONS, expirationIdFromDates } from '@/lib/paste/expiration';
import { LANGUAGES } from '@/lib/paste/languages';
import { encryptTextWithKey } from '@/lib/crypto/client';
import { decryptPayload } from '@/lib/crypto/client';
import { readKeyFromHash } from '@/lib/crypto/fragment';
import { ApiError, loadPasteForEdit, updatePaste } from '@/lib/client/api';
import { getEditToken, updateHistoryEntry } from '@/lib/client/history';
import { byteLength } from '@/lib/validation/paste';
import { formatBytes } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';
import { docToPlainText } from '@/lib/document/plain-text';
import { emptyDocument } from '@/lib/document/empty';
import { parseDocumentJson, type TinyPasteDoc } from '@/lib/document/schema';
import type { PasteMetadata } from '@/types/paste';

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({ value: language.id, label: language.label }));
const EXPIRATION_SELECT_OPTIONS = EXPIRATION_OPTIONS.map((option) => ({
  value: option.id,
  label: option.label,
}));

type LoadState =
  | { phase: 'loading' }
  | { phase: 'unauthorised'; message: string }
  | { phase: 'ready'; meta: PasteMetadata };

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Edit screen.
 *
 * The edit token is read from this browser's local store and sent in a header.
 * The server re-verifies it against the stored hash on every request, so the
 * client-side check below is only about what UI to show.
 *
 * Encrypted pastes are decrypted and re-encrypted locally with the key from the
 * URL fragment, so an edit never turns ciphertext into plaintext on the server.
 * For a document paste that decrypted (or loaded) text is JSON, parsed back
 * into Tiptap's document before the editor ever mounts — encryption mode and
 * content type are both fixed at creation (see the immutability checks in
 * lib/paste/service.ts), so which editor to show never changes mid-edit.
 */
export function EditPasteForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { resolved: theme } = useTheme();
  const modifier = useModifierLabel();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [title, setTitle] = useState('');
  const [codeText, setCodeText] = useState('');
  const [docContent, setDocContent] = useState<TinyPasteDoc | null>(null);
  const [language, setLanguage] = useState('plaintext');
  const [expiration, setExpiration] = useState('7d');
  const [wordWrap, setWordWrap] = useState(false);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const encryptionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = getEditToken(slug);
      if (!token) {
        setState({
          phase: 'unauthorised',
          message: 'This browser has no edit token for this paste, so it cannot be modified here.',
        });
        return;
      }

      try {
        const { meta, body } = await loadPasteForEdit(slug, token);
        if (cancelled) return;

        setTitle(meta.title ?? '');
        setLanguage(meta.language);
        setExpiration(expirationIdFromDates(meta.createdAt, meta.expiresAt));

        const applyText = (text: string) => {
          if (meta.contentType === 'document') {
            try {
              setDocContent(parseDocumentJson(text));
            } catch {
              // A stored document that no longer parses is unreachable in
              // practice (every write path validates first) — fail open into
              // an empty document rather than blocking the edit entirely.
              setDocContent(emptyDocument());
            }
          } else {
            setCodeText(text);
          }
        };

        if (body.kind === 'encrypted') {
          const key = readKeyFromHash(window.location.hash);
          if (!key) {
            setState({
              phase: 'unauthorised',
              message:
                'Encryption key missing from this URL. Open the edit page from the complete paste link, including everything after #.',
            });
            return;
          }
          encryptionKeyRef.current = key;
          try {
            applyText(
              await decryptPayload(
                { ciphertext: body.ciphertext, iv: body.iv, encryptionVersion: body.encryptionVersion },
                key,
              ),
            );
          } catch {
            setState({ phase: 'unauthorised', message: 'Unable to decrypt this paste with the key in this URL.' });
            return;
          }
        } else {
          applyText(body.content);
        }

        setState({ phase: 'ready', meta });
      } catch (caught) {
        if (cancelled) return;
        setState({
          phase: 'unauthorised',
          message: caught instanceof ApiError ? caught.message : 'This paste could not be loaded for editing.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const contentType = state.phase === 'ready' ? state.meta.contentType : 'code';
  const rawContent = contentType === 'document' ? JSON.stringify(docContent ?? emptyDocument()) : codeText;
  const plainTextPreview = contentType === 'document' ? docToPlainText(docContent ?? emptyDocument()) : codeText;

  const save = useCallback(async () => {
    if (state.phase !== 'ready' || saving) return;
    setError(null);

    if (plainTextPreview.trim().length === 0) {
      setError('Paste content cannot be empty.');
      return;
    }
    if (byteLength(rawContent) > MAX_CONTENT_BYTES) {
      setError(`Pastes are limited to ${formatBytes(MAX_CONTENT_BYTES)}.`);
      return;
    }

    const token = getEditToken(slug);
    if (!token) {
      setError('The edit token for this paste is no longer available in this browser.');
      return;
    }

    setSaving(true);
    try {
      const cleanTitle = title.trim() ? title.trim() : null;
      const body = state.meta.isEncrypted
        ? await (async () => {
            const key = encryptionKeyRef.current;
            if (!key) throw new Error('missing key');
            // Re-encrypt locally with a fresh IV; the server still sees only
            // ciphertext, and the key never leaves this page.
            const encrypted = await encryptTextWithKey(rawContent, key);
            return {
              title: cleanTitle,
              language,
              contentType: state.meta.contentType,
              expiration,
              isEncrypted: true as const,
              encryptedContent: encrypted.ciphertext,
              encryptionIv: encrypted.iv,
              encryptionVersion: encrypted.encryptionVersion,
            };
          })()
        : {
            title: cleanTitle,
            language,
            contentType: state.meta.contentType,
            expiration,
            isEncrypted: false as const,
            content: rawContent,
          };

      const { meta } = await updatePaste(slug, token, body);
      updateHistoryEntry(slug, {
        title: meta.title,
        language: meta.language,
        contentType: meta.contentType,
        expiresAt: meta.expiresAt,
      });
      toast('Paste updated', 'success');
      router.push(`/p/${slug}${state.meta.isEncrypted ? window.location.hash : ''}`);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.details[0] ?? caught.message : 'Could not save your changes.';
      setError(message);
      toast(message, 'error');
      setSaving(false);
    }
  }, [expiration, language, plainTextPreview, rawContent, router, saving, slug, state, title, toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  if (state.phase === 'loading') {
    return <p className="py-20 text-center text-sm text-text-muted">Loading paste…</p>;
  }

  if (state.phase === 'unauthorised') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border-base bg-surface text-text-muted tp-shadow">
          <ShieldAlert aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        {/* h2: the page itself already carries the (visually hidden) h1. */}
        <h2 className="text-[15px] font-semibold">This paste cannot be edited here.</h2>
        <p className="mt-2 text-[13px] text-text-muted">{state.message}</p>
        <Link
          href={`/p/${slug}`}
          className="mt-6 inline-flex h-9 items-center rounded-md border border-border-base bg-surface px-3.5 text-[13px] font-medium tp-transition hover:border-border-strong hover:bg-surface-muted"
        >
          Back to the paste
        </Link>
      </div>
    );
  }

  const size = byteLength(rawContent);
  const overLimit = size > MAX_CONTENT_BYTES;
  const isMonaco = state.meta.contentType !== 'document';
  const isDocumentReady = state.meta.contentType === 'document' && docContent !== null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex min-h-0 flex-1 flex-col gap-3"
      noValidate
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col rounded-xl border bg-editor tp-shadow tp-transition',
          overLimit ? 'border-danger-line' : 'border-border-base focus-within:border-border-strong',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border-base px-2 py-1.5 sm:px-3">
          <label htmlFor="edit-title" className="sr-only">
            Title
          </label>
          <input
            id="edit-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled paste"
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] font-medium tracking-[-0.01em] outline-none placeholder:font-normal placeholder:text-text-subtle"
          />
          {isMonaco ? (
            <ToggleChip icon={WrapText} label="Wrap" pressed={wordWrap} onToggle={setWordWrap} className="h-8 shrink-0" />
          ) : null}
          {state.meta.contentType === 'code' ? (
            <InlineSelect
              label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              options={LANGUAGE_OPTIONS}
              containerClassName="w-[9.5rem] shrink-0"
            />
          ) : null}
        </div>

        {/* See paste-editor.tsx's identical wrapper for why this is `absolute
            inset-0` rather than a plain percentage-height child. */}
        <div className="relative min-h-[clamp(300px,46vh,640px)] flex-1">
          <div className="absolute inset-0">
            {state.meta.contentType === 'document' ? (
              isDocumentReady ? (
                <DocumentEditor
                  initialContent={docContent}
                  onChange={setDocContent}
                  onSubmit={() => void save()}
                  className="h-full"
                />
              ) : null
            ) : (
              <CodeEditor
                value={codeText}
                onChange={setCodeText}
                language={language}
                theme={theme}
                wordWrap={wordWrap}
                onCursorChange={setCursor}
                onSubmit={() => void save()}
                className="h-full"
                variant={state.meta.contentType === 'plaintext' ? 'text' : 'code'}
                placeholder={
                  state.meta.contentType === 'plaintext' ? 'Start typing or paste text…' : '// Paste or write code…'
                }
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border-base px-2 py-1.5 sm:px-2.5">
          <InlineSelect
            label="Expiration"
            icon={Timer}
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            options={EXPIRATION_SELECT_OPTIONS}
            containerClassName="w-[8.5rem] shrink-0"
          />
          {state.meta.isEncrypted ? (
            <span className="inline-flex items-center gap-1.5 px-1 text-xs text-text-subtle">
              <Lock aria-hidden className="h-3 w-3" />
              Re-encrypted in your browser on save
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2 px-1 text-[12px] tabular-nums text-text-subtle">
            {isMonaco ? (
              <span className="hidden sm:inline">
                Ln {cursor.line}, Col {cursor.column}
              </span>
            ) : (
              <span className="hidden sm:inline">{wordCount(plainTextPreview).toLocaleString()} words</span>
            )}
            <span className={cn(overLimit && 'font-medium text-danger')}>
              {formatBytes(size)} of {formatBytes(MAX_CONTENT_BYTES)}
            </span>
            <span>{plainTextPreview.length.toLocaleString()} chars</span>
          </span>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger tp-fade"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" variant="ghost" onClick={() => router.push(`/p/${slug}`)} disabled={saving}>
          Cancel
        </Button>
        <span className="ml-auto hidden items-center gap-1 text-xs text-text-subtle md:flex">
          <Kbd>{modifier}</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <Button type="submit" variant="primary" size="lg" disabled={saving || overLimit} className="ml-auto md:ml-0">
          {saving ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save aria-hidden className="h-4 w-4" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
