'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Braces,
  Eraser,
  Flame,
  KeyRound,
  Loader2,
  ShieldCheck,
  Timer,
  WrapText,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { InlineSelect } from '@/components/ui/inline-select';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { ModeTabs } from '@/components/editor/mode-tabs';
import { CodeEditor, type CursorPosition } from '@/components/editor/code-editor';
import { DocumentEditor } from '@/components/editor/document-editor';
import { Kbd, useModifierLabel } from '@/components/ui/kbd';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/components/theme-provider';
import { MAX_CONTENT_BYTES, MAX_TITLE_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/config/constants';
import { DEFAULT_EXPIRATION, EXPIRATION_OPTIONS } from '@/lib/paste/expiration';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/paste/languages';
import type { ContentTypeId } from '@/lib/paste/content-type';
import { emptyDocument, textToDocument } from '@/lib/document/empty';
import { docToPlainText } from '@/lib/document/plain-text';
import { parseDocumentJson, type TinyPasteDoc } from '@/lib/document/schema';
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

/** Size is only worth showing once it is close enough to the cap to matter. */
const SIZE_HINT_THRESHOLD = MAX_CONTENT_BYTES / 2;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function PasteEditor() {
  const router = useRouter();
  const { toast } = useToast();
  const { resolved: theme } = useTheme();
  const modifier = useModifierLabel();
  const titleRef = useRef<HTMLInputElement>(null);
  const passwordPopoverRef = useRef<HTMLDivElement>(null);
  const passwordChipRef = useRef<HTMLButtonElement>(null);

  /**
   * A pending fork is consumed while initialising state, so the editor renders
   * seeded content on its very first pass. The seed only ever exists after a
   * client-side navigation, so server and client both start empty and there is
   * no hydration mismatch.
   */
  const [forkSeed] = useState(() => consumeForkSeed());
  const forkDocument = useMemo(() => {
    if (forkSeed?.contentType !== 'document') return null;
    try {
      return parseDocumentJson(forkSeed.content);
    } catch {
      return null;
    }
  }, [forkSeed]);

  const [title, setTitle] = useState(() =>
    forkSeed?.title ? `Fork of ${forkSeed.title}`.slice(0, MAX_TITLE_LENGTH) : '',
  );
  const [mode, setMode] = useState<ContentTypeId>(() => forkSeed?.contentType ?? 'code');
  /** Shared between CODE and PLAIN TEXT — both are just Monaco with a different language. */
  const [codeText, setCodeText] = useState(() => (forkDocument ? '' : forkSeed?.content ?? ''));
  const [language, setLanguage] = useState<string>(forkSeed?.language ?? DEFAULT_LANGUAGE);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });
  // Named docContent, not `document`, so it never shadows the DOM global the
  // password popover's click-outside handler below relies on.
  const [docContent, setDocContent] = useState<TinyPasteDoc>(() => forkDocument ?? emptyDocument());
  // Bumped only when `docContent` is reseeded wholesale (a mode switch, a
  // fork), never by ordinary typing — see DocumentEditor's own contract for why.
  const [documentSeedVersion, setDocumentSeedVersion] = useState(0);

  const [expiration, setExpiration] = useState<string>(DEFAULT_EXPIRATION);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [encrypt, setEncrypt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirm the fork after mount; the content itself is already in state.
  useEffect(() => {
    if (forkSeed) toast('Content copied into a new paste', 'info');
  }, [forkSeed, toast]);

  const rawContent = mode === 'document' ? JSON.stringify(docContent) : codeText;
  const size = byteLength(rawContent);
  const overLimit = size > MAX_CONTENT_BYTES;
  const plainTextPreview = mode === 'document' ? docToPlainText(docContent) : codeText;
  const lineCount = codeText.length === 0 ? 0 : codeText.split('\n').length;

  // Encryption and server passwords are mutually exclusive in version 1.
  const toggleEncrypt = (next: boolean) => {
    setEncrypt(next);
    if (next) {
      setUsePassword(false);
      setPasswordOpen(false);
      setPassword('');
    }
  };

  const toggleUsePassword = (next: boolean) => {
    setUsePassword(next);
    setPasswordOpen(next);
    if (next) setEncrypt(false);
    if (!next) setPassword('');
  };

  /**
   * Switching modes converts what is reasonable to convert instead of
   * discarding it: Code and Plain Text already share the same text, and going
   * to or from Document seeds one from a plain-text flattening of the other.
   * Nothing here can silently lose the *original* text either way — only
   * formatting a document mode never had is what does not survive the round
   * trip.
   */
  const changeMode = (next: ContentTypeId) => {
    if (next === mode) return;
    if (next === 'document' && mode !== 'document') {
      setDocContent(codeText.trim() ? textToDocument(codeText) : emptyDocument());
      setDocumentSeedVersion((v) => v + 1);
    } else if (next !== 'document' && mode === 'document') {
      setCodeText(docToPlainText(docContent));
    }
    if (next === 'plaintext') setLanguage('plaintext');
    setMode(next);
  };

  const formatJson = () => {
    try {
      setCodeText(JSON.stringify(JSON.parse(codeText), null, 2));
      toast('JSON formatted', 'success');
    } catch {
      toast('That is not valid JSON', 'error');
    }
  };

  const clear = () => {
    setTitle('');
    setCodeText('');
    setDocContent(emptyDocument());
    setDocumentSeedVersion((v) => v + 1);
    setError(null);
    titleRef.current?.focus();
  };

  // The popover is transient chrome: dismissing it leaves the option itself on.
  useEffect(() => {
    if (!passwordOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (passwordPopoverRef.current?.contains(target) || passwordChipRef.current?.contains(target)) return;
      setPasswordOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPasswordOpen(false);
      passwordChipRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [passwordOpen]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setError(null);

    if (plainTextPreview.trim().length === 0) {
      setError('Enter something to paste.');
      return;
    }
    if (byteLength(rawContent) > MAX_CONTENT_BYTES) {
      setError(`Pastes are limited to ${formatBytes(MAX_CONTENT_BYTES)}.`);
      return;
    }
    if (usePassword && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      setPasswordOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const cleanTitle = title.trim() ? title.trim() : null;
      // Document mode ignores the language selector entirely; 'plaintext' is
      // stored so the column still holds a value the API accepts.
      const effectiveLanguage = mode === 'document' ? 'plaintext' : language;
      let encryptionKey: string | null = null;

      const result = encrypt
        ? await (async () => {
            // Encrypt first: the plaintext (or serialized document JSON)
            // never enters the request body.
            const encrypted = await encryptText(rawContent);
            encryptionKey = encrypted.key;
            return createPaste({
              title: cleanTitle,
              language: effectiveLanguage,
              contentType: mode,
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
            language: effectiveLanguage,
            contentType: mode,
            expiration,
            burnAfterRead,
            isEncrypted: false,
            content: rawContent,
            password: usePassword ? password : null,
          });

      rememberPaste({
        slug: result.slug,
        title: result.meta.title,
        language: result.meta.language,
        contentType: result.meta.contentType,
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
    encrypt,
    expiration,
    language,
    mode,
    password,
    plainTextPreview,
    rawContent,
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
    const onFocus = () => titleRef.current?.focus();
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

  const showSize = size >= SIZE_HINT_THRESHOLD;
  const isMonaco = mode === 'code' || mode === 'plaintext';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex min-h-0 flex-1 flex-col gap-2"
      noValidate
    >
      <div className="flex items-center justify-between">
        <ModeTabs value={mode} onChange={changeMode} disabled={submitting} />
      </div>

      {/*
        One surface, three bands: identity, canvas, controls. Nesting these in
        separate cards is what made the old screen read as a web form.
      */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-visible rounded-xl border bg-editor tp-shadow tp-transition',
          overLimit ? 'border-danger-line' : 'border-border-base focus-within:border-border-strong',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border-base px-2 py-1.5 sm:px-3">
          <label htmlFor="paste-title" className="sr-only">
            Title
          </label>
          <input
            ref={titleRef}
            id="paste-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled paste"
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[13px] font-medium tracking-[-0.01em] outline-none placeholder:font-normal placeholder:text-text-subtle"
          />
          {isMonaco ? (
            <ToggleChip
              icon={WrapText}
              label="Wrap"
              pressed={wordWrap}
              onToggle={setWordWrap}
              className="h-8 shrink-0"
            />
          ) : null}
          {mode === 'code' ? (
            <InlineSelect
              label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              options={LANGUAGE_OPTIONS}
              containerClassName="w-[9.5rem] shrink-0"
            />
          ) : null}
        </div>

        {/*
          Monaco (and Tiptap's scroll container) size themselves to a
          percentage of their parent, and a flex item's height is only
          "definite" for that purpose once the flex algorithm has actually run
          — which briefly is not the case on first paint. `absolute inset-0`
          gives them a box whose size the browser resolves immediately from
          this wrapper's own (relatively positioned, flex-grown) box, instead
          of a percentage chain that can catch that first, too-small pass.
        */}
        <div className="relative min-h-[42vh] flex-1 sm:min-h-[46vh]">
          <div className="absolute inset-0">
            {mode === 'document' ? (
              <DocumentEditor
                key={documentSeedVersion}
                initialContent={docContent}
                onChange={setDocContent}
                onSubmit={() => void submit()}
                placeholder="Start writing…"
                className="h-full"
              />
            ) : (
              <CodeEditor
                value={codeText}
                onChange={setCodeText}
                language={language}
                theme={theme}
                wordWrap={wordWrap}
                onCursorChange={setCursor}
                onSubmit={() => void submit()}
                className="h-full"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-border-base px-2 py-1.5 sm:px-2.5">
          <InlineSelect
            label="Expiration"
            icon={Timer}
            value={expiration}
            onChange={(event) => setExpiration(event.target.value)}
            options={EXPIRATION_SELECT_OPTIONS}
            containerClassName="w-[8.5rem] shrink-0"
          />

          <span aria-hidden className="mx-1 hidden h-4 w-px bg-border-base sm:block" />

          <div className="relative">
            <ToggleChip
              ref={passwordChipRef}
              icon={KeyRound}
              label="Password"
              pressed={usePassword}
              disabled={encrypt}
              onToggle={(next) => (usePassword && !passwordOpen ? setPasswordOpen(true) : toggleUsePassword(next))}
              aria-expanded={usePassword ? passwordOpen : undefined}
              aria-controls={usePassword ? 'password-popover' : undefined}
            />
            {usePassword && passwordOpen ? (
              <div
                ref={passwordPopoverRef}
                id="password-popover"
                className="absolute bottom-full left-0 z-30 mb-2 w-[17rem] rounded-lg border border-border-base bg-surface p-3 tp-shadow-pop tp-pop"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-subtle">
                    Password protection
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordOpen(false);
                      passwordChipRef.current?.focus();
                    }}
                    aria-label="Close password panel"
                    className="-mr-1 rounded p-1 text-text-subtle tp-transition hover:text-text-base"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
                <TextField
                  label="Password"
                  labelHidden
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  hint="Stored only as a hash. Share it separately from the link."
                />
              </div>
            ) : null}
          </div>

          <ToggleChip
            icon={Flame}
            label="Burn once"
            tone="warning"
            pressed={burnAfterRead}
            onToggle={setBurnAfterRead}
          />

          <ToggleChip
            icon={ShieldCheck}
            label="Encrypt"
            pressed={encrypt}
            disabled={usePassword}
            onToggle={toggleEncrypt}
            className={encrypt ? 'ring-1 ring-inset ring-accent-line' : undefined}
          />

          {mode === 'code' && language === 'json' && codeText.trim().length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={formatJson}>
              <Braces aria-hidden className="h-3.5 w-3.5" />
              Format
            </Button>
          ) : null}

          <span className="ml-auto flex items-center gap-2 pl-1 pr-1 text-[12px] tabular-nums text-text-subtle">
            {isMonaco ? (
              <span className="hidden sm:inline">
                Ln {cursor.line}, Col {cursor.column}
              </span>
            ) : (
              <span className="hidden sm:inline">{wordCount(plainTextPreview).toLocaleString()} words</span>
            )}
            {isMonaco ? <span>{lineCount.toLocaleString()} lines</span> : null}
            {showSize ? (
              <span className={cn(overLimit && 'font-medium text-danger')}>
                {formatBytes(size)} of {formatBytes(MAX_CONTENT_BYTES)}
              </span>
            ) : null}
            <span>{plainTextPreview.length.toLocaleString()} chars</span>
          </span>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger tp-fade"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-text-subtle">
          {encrypt ? (
            <>
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span>Encrypted locally. The server never receives the plaintext.</span>
            </>
          ) : usePassword ? (
            <>
              <KeyRound aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>Readers must enter the password. Share it separately from the link.</span>
            </>
          ) : null}
        </p>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={clear} disabled={submitting}>
            <Eraser aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
            <span className="sr-only sm:hidden">Clear the editor</span>
          </Button>
          <span className="hidden items-center gap-1 text-xs text-text-subtle md:flex">
            <Kbd>{modifier}</Kbd>
            <Kbd>Enter</Kbd>
          </span>
          <Button type="submit" variant="primary" size="lg" disabled={submitting || overLimit}>
            {submitting ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                Creating paste…
              </>
            ) : (
              <>
                Create paste
                <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={2.1} />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
