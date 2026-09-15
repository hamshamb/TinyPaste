'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock, Save, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
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

/**
 * Edit screen.
 *
 * The edit token is read from this browser's local store and sent in a header.
 * The server re-verifies it against the stored hash on every request, so the
 * client-side check below is only about what UI to show.
 *
 * Encrypted pastes are decrypted and re-encrypted locally with the key from the
 * URL fragment, so an edit never turns ciphertext into plaintext on the server.
 */
export function EditPasteForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [expiration, setExpiration] = useState('7d');
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
            setContent(
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
          setContent(body.content);
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

  const save = useCallback(async () => {
    if (state.phase !== 'ready' || saving) return;
    setError(null);

    if (content.trim().length === 0) {
      setError('Paste content cannot be empty.');
      return;
    }
    if (byteLength(content) > MAX_CONTENT_BYTES) {
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
            const encrypted = await encryptTextWithKey(content, key);
            return {
              title: cleanTitle,
              language,
              expiration,
              isEncrypted: true as const,
              encryptedContent: encrypted.ciphertext,
              encryptionIv: encrypted.iv,
              encryptionVersion: encrypted.encryptionVersion,
            };
          })()
        : { title: cleanTitle, language, expiration, isEncrypted: false as const, content };

      const { meta } = await updatePaste(slug, token, body);
      updateHistoryEntry(slug, {
        title: meta.title,
        language: meta.language,
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
  }, [content, expiration, language, router, saving, slug, state, title, toast]);

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
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-surface text-text-muted">
          <ShieldAlert aria-hidden className="h-5 w-5" />
        </span>
        <h1 className="text-base font-semibold">This paste cannot be edited here.</h1>
        <p className="mt-2 text-sm text-text-muted">{state.message}</p>
        <Link
          href={`/p/${slug}`}
          className="mt-6 inline-flex h-10 items-center rounded-md border border-border-base bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
        >
          Back to the paste
        </Link>
      </div>
    );
  }

  const size = byteLength(content);
  const overLimit = size > MAX_CONTENT_BYTES;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label="Title"
          labelHidden
          placeholder="Optional title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          containerClassName="flex-1"
          className="font-mono"
        />
        <SelectField
          label="Language"
          labelHidden
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          options={LANGUAGE_OPTIONS}
          containerClassName="sm:w-44"
        />
        <SelectField
          label="Expiration"
          labelHidden
          value={expiration}
          onChange={(event) => setExpiration(event.target.value)}
          options={EXPIRATION_SELECT_OPTIONS}
          containerClassName="sm:w-40"
        />
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-surface',
          overLimit ? 'border-danger' : 'border-border-base focus-within:border-border-strong',
        )}
      >
        <label htmlFor="edit-content" className="sr-only">
          Paste content
        </label>
        <textarea
          id="edit-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className="block min-h-[46vh] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-[1.65] outline-none"
        />
        <div className="flex items-center gap-3 border-t border-border-base bg-surface-muted px-4 py-2 text-xs text-text-subtle">
          <span className={cn(overLimit && 'font-medium text-danger')}>
            {formatBytes(size)} of {formatBytes(MAX_CONTENT_BYTES)}
          </span>
          {state.meta.isEncrypted ? (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Lock aria-hidden className="h-3 w-3" />
              Re-encrypted in your browser on save
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={saving || overLimit}>
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
        <Button
          type="button"
          size="lg"
          onClick={() => router.push(`/p/${slug}`)}
          disabled={saving}
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
