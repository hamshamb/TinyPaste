'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Braces, ChevronDown, Loader2, Lock, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/config/constants';
import { DEFAULT_EXPIRATION, EXPIRATION_OPTIONS } from '@/lib/paste/expiration';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/paste/languages';
import { encryptText } from '@/lib/crypto/client';
import { buildFragment } from '@/lib/crypto/fragment';
import { ApiError, createPaste } from '@/lib/client/api';
import { rememberPaste } from '@/lib/client/history';
import { byteLength } from '@/lib/validation/paste';
import { formatBytes } from '@/lib/utils/time';
import { cn } from '@/lib/utils/cn';
import { consumeForkSeed } from '@/lib/client/fork';

const LANGUAGE_OPTIONS = LANGUAGES.map((language) => ({ value: language.id, label: language.label }));
const EXPIRATION_SELECT_OPTIONS = EXPIRATION_OPTIONS.map((option) => ({
  value: option.id,
  label: option.label,
}));

export function PasteEditor() {
  const router = useRouter();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * A pending fork is consumed while initialising state, so the editor renders
   * seeded content on its very first pass. The seed only ever exists after a
   * client-side navigation, so server and client both start empty and there is
   * no hydration mismatch.
   */
  const [forkSeed] = useState(() => consumeForkSeed());

  const [title, setTitle] = useState(() =>
    forkSeed?.title ? `Fork of ${forkSeed.title}`.slice(0, MAX_TITLE_LENGTH) : '',
  );
  const [content, setContent] = useState(() => forkSeed?.content ?? '');
  const [language, setLanguage] = useState<string>(forkSeed?.language ?? DEFAULT_LANGUAGE);
  const [expiration, setExpiration] = useState<string>(DEFAULT_EXPIRATION);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirm the fork after mount; the content itself is already in state.
  useEffect(() => {
    if (forkSeed) toast('Content copied into a new paste', 'info');
  }, [forkSeed, toast]);

  const size = byteLength(content);
  const overLimit = size > MAX_CONTENT_BYTES;

  // Encryption and server passwords are mutually exclusive in version 1.
  const toggleEncrypt = (next: boolean) => {
    setEncrypt(next);
    if (next) {
      setUsePassword(false);
      setPassword('');
    }
  };

  const toggleUsePassword = (next: boolean) => {
    setUsePassword(next);
    if (next) setEncrypt(false);
    if (!next) setPassword('');
  };

  const formatJson = () => {
    try {
      setContent(JSON.stringify(JSON.parse(content), null, 2));
      toast('JSON formatted', 'success');
    } catch {
      toast('That is not valid JSON', 'error');
    }
  };

  const clear = () => {
    setTitle('');
    setContent('');
    setError(null);
    textareaRef.current?.focus();
  };

  const submit = useCallback(async () => {
    if (submitting) return;
    setError(null);

    if (content.trim().length === 0) {
      setError('Enter something to paste.');
      textareaRef.current?.focus();
      return;
    }
    if (byteLength(content) > MAX_CONTENT_BYTES) {
      setError(`Pastes are limited to ${formatBytes(MAX_CONTENT_BYTES)}.`);
      return;
    }
    if (usePassword && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      const cleanTitle = title.trim() ? title.trim() : null;
      let encryptionKey: string | null = null;

      const result = encrypt
        ? await (async () => {
            // Encrypt first: the plaintext never enters the request body.
            const encrypted = await encryptText(content);
            encryptionKey = encrypted.key;
            return createPaste({
              title: cleanTitle,
              language,
              expiration,
              burnAfterRead,
              isEncrypted: true,
              encryptedContent: encrypted.ciphertext,
              encryptionIv: encrypted.iv,
              encryptionVersion: encrypted.encryptionVersion,
            });
          })()
        : await createPaste({
            title: cleanTitle,
            language,
            expiration,
            burnAfterRead,
            isEncrypted: false,
            content,
            password: usePassword ? password : null,
          });

      rememberPaste({
        slug: result.slug,
        title: result.meta.title,
        language: result.meta.language,
        createdAt: result.meta.createdAt,
        expiresAt: result.meta.expiresAt,
        isEncrypted: result.meta.isEncrypted,
        burnAfterRead: result.meta.burnAfterRead,
        isPasswordProtected: result.meta.isPasswordProtected,
        editToken: result.editToken,
        ...(encryptionKey ? { encryptionKey } : {}),
      });

      // The key goes into the fragment, which the browser never transmits.
      const target = `/p/${result.slug}?created=1${encryptionKey ? `#${buildFragment(encryptionKey)}` : ''}`;
      router.push(target);
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.details[0] ?? caught.message
          : 'Could not create the paste. Please try again.';
      setError(message);
      toast(message, 'error');
      setSubmitting(false);
    }
  }, [
    burnAfterRead,
    content,
    encrypt,
    expiration,
    language,
    password,
    router,
    submitting,
    title,
    toast,
    usePassword,
  ]);

  // Ctrl/Cmd+Enter submits from anywhere on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submit]);

  // The command palette drives the editor through these window events.
  useEffect(() => {
    const onClear = () => clear();
    const onFocus = () => textareaRef.current?.focus();
    const onCreate = () => void submit();
    window.addEventListener('tinypaste:clear-editor', onClear);
    window.addEventListener('tinypaste:focus-editor', onFocus);
    window.addEventListener('tinypaste:create-paste', onCreate);
    return () => {
      window.removeEventListener('tinypaste:clear-editor', onClear);
      window.removeEventListener('tinypaste:focus-editor', onFocus);
      window.removeEventListener('tinypaste:create-paste', onCreate);
    };
  }, [submit]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
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
          autoComplete="off"
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
      </div>

      <div
        className={cn(
          'relative overflow-hidden rounded-lg border bg-surface transition-colors',
          overLimit ? 'border-danger' : 'border-border-base focus-within:border-border-strong',
        )}
      >
        <label htmlFor="paste-content" className="sr-only">
          Paste content
        </label>
        <textarea
          ref={textareaRef}
          id="paste-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste or type your text, code, logs or configuration here…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-describedby="paste-content-meta"
          aria-invalid={overLimit || undefined}
          className="block min-h-[46vh] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-[1.65] outline-none placeholder:text-text-subtle sm:min-h-[52vh]"
        />
        <div
          id="paste-content-meta"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-base bg-surface-muted px-4 py-2 text-xs text-text-subtle"
        >
          <span>{content.length.toLocaleString()} characters</span>
          <span aria-hidden>·</span>
          <span className={cn(overLimit && 'font-medium text-danger')}>
            {formatBytes(size)} of {formatBytes(MAX_CONTENT_BYTES)}
          </span>
          {language === 'json' && content.trim().length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={formatJson} className="ml-auto">
              <Braces aria-hidden className="h-3.5 w-3.5" />
              Format
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border-base bg-surface">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <SelectField
            label="Expiration"
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            options={EXPIRATION_SELECT_OPTIONS}
            containerClassName="sm:w-44"
          />
          <button
            type="button"
            onClick={() => setOptionsOpen((open) => !open)}
            aria-expanded={optionsOpen}
            aria-controls="advanced-options"
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-text-muted transition-colors hover:text-text-base sm:self-end"
          >
            <ChevronDown
              aria-hidden
              className={cn('h-4 w-4 transition-transform', optionsOpen && 'rotate-180')}
            />
            Security options
            {burnAfterRead || usePassword || encrypt ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                {[burnAfterRead, usePassword, encrypt].filter(Boolean).length}
              </span>
            ) : null}
          </button>
        </div>

        <div id="advanced-options" hidden={!optionsOpen} className="border-t border-border-base p-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <Checkbox
              label="Password protect"
              description="Readers must enter a password. Stored only as a hash."
              checked={usePassword}
              onChange={(event) => toggleUsePassword(event.target.checked)}
              disabled={encrypt}
            />
            <Checkbox
              label="Burn after reading"
              description="Destroyed the first time someone opens it."
              checked={burnAfterRead}
              onChange={(event) => setBurnAfterRead(event.target.checked)}
            />
            <Checkbox
              label="Encrypt in browser"
              description="The server only ever receives ciphertext."
              checked={encrypt}
              onChange={(event) => toggleEncrypt(event.target.checked)}
              disabled={usePassword}
            />
          </div>

          {usePassword ? (
            <div className="mt-4 max-w-sm">
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                hint="Share this separately from the link."
              />
            </div>
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-xs text-text-subtle">
            <Shield aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {encrypt
              ? 'Encrypted pastes are encrypted in your browser before being sent to the server. The key lives after # in the URL and is never stored by us.'
              : 'Browser encryption and password protection cannot be combined in this version — pick whichever fits.'}
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={submitting || overLimit}>
          {submitting ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              Creating paste…
            </>
          ) : (
            <>
              {encrypt ? <Lock aria-hidden className="h-4 w-4" /> : null}
              Create Paste
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={clear} disabled={submitting}>
          <Trash2 aria-hidden className="h-4 w-4" />
          Clear
        </Button>
        <p className="ml-auto hidden text-xs text-text-subtle sm:block">
          <kbd className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 font-mono text-[11px]">
            Ctrl
          </kbd>
          {' + '}
          <kbd className="rounded border border-border-base bg-surface-muted px-1.5 py-0.5 font-mono text-[11px]">
            Enter
          </kbd>{' '}
          to create
        </p>
      </div>
    </form>
  );
}
