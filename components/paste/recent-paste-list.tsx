'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Flame, KeyRound, Lock, Pencil, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { ExpiryTime, RelativeTime } from '@/components/ui/time';
import { useToast } from '@/components/ui/toast';
import { buildFragment } from '@/lib/crypto/fragment';
import { clearHistory, forgetPaste, listHistory, subscribeHistory, type HistoryEntry } from '@/lib/client/history';
import { isExpired } from '@/lib/paste/expiration';
import { languageLabel } from '@/lib/paste/languages';

/**
 * A document paste's `language` is always 'plaintext' (the field is
 * meaningless in DOCUMENT mode — see the editor's mode tabs), so the language
 * column shows the content type name instead for those rows.
 */
function typeLabel(entry: Pick<HistoryEntry, 'language' | 'contentType'>): string {
  return entry.contentType === 'document' ? 'Document' : languageLabel(entry.language);
}

/**
 * Recent pastes.
 *
 * Reads only this browser's local history. There is no global feed and no
 * server-side listing endpoint at all — the server cannot enumerate pastes for
 * anyone, including us.
 *
 * Rendered as a dense list rather than cards: this is a history you scan for
 * one line, which is the same job a command palette does.
 */
export function RecentPasteList() {
  const { toast } = useToast();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const subscribe = useCallback((listener: () => void) => subscribeHistory(listener), []);
  const entries = useSyncExternalStore<HistoryEntry[] | null>(
    subscribe,
    () => listHistory(),
    // Server snapshot: history lives in the browser, so there is nothing to
    // render until hydration.
    () => null,
  );

  if (entries === null) {
    return <p className="py-16 text-center text-sm text-text-muted">Loading your pastes…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-base px-6 py-16 text-center">
        <p className="text-sm font-medium">No pastes from this browser yet.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-text-muted">
          Pastes you create are remembered here, on this device only. Clearing site data removes them along
          with their edit tokens.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md border border-border-base bg-surface px-3.5 text-[13px] font-medium tp-transition hover:border-border-strong hover:bg-surface-muted"
        >
          Create a paste
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border-base bg-surface">
        {/* Column captions, desktop only: the rows are self-describing on a phone. */}
        <div className="hidden items-center gap-3 border-b border-border-base px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-text-subtle md:flex">
          <span className="flex-1">Paste</span>
          <span className="w-24">Language</span>
          <span className="w-28">Created</span>
          <span className="w-32">Expires</span>
          <span className="w-[8.5rem]" />
        </div>

        <ul>
          {entries.map((entry) => {
            const expired = isExpired(entry.expiresAt);
            // Encrypted links are only useful with their fragment key.
            const fragment = entry.encryptionKey ? `#${buildFragment(entry.encryptionKey)}` : '';
            const href = `/p/${entry.slug}${fragment}`;

            return (
              <li
                key={entry.slug}
                className="group flex flex-col gap-2 border-b border-border-base px-3 py-2.5 tp-transition last:border-b-0 hover:bg-surface-muted/60 md:flex-row md:items-center md:gap-3 md:py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={href}
                      className="truncate rounded text-[13px] font-medium tp-transition hover:text-accent"
                    >
                      {entry.title || 'Untitled'}
                    </Link>
                    {entry.isEncrypted ? <Tag icon={Lock}>Encrypted</Tag> : null}
                    {entry.isPasswordProtected ? <Tag icon={KeyRound}>Password</Tag> : null}
                    {entry.burnAfterRead ? <Tag icon={Flame}>Burn</Tag> : null}
                    {expired ? (
                      <span className="rounded border border-border-base px-1.5 py-0.5 text-[11px] font-medium text-text-subtle">
                        Expired
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-text-subtle">
                    <span>{entry.slug}</span>
                    {/* The columns collapse into this line below the md breakpoint. */}
                    <span aria-hidden className="md:hidden">
                      ·
                    </span>
                    <span className="md:hidden">{typeLabel(entry)}</span>
                    <span aria-hidden className="md:hidden">
                      ·
                    </span>
                    <span className="md:hidden">
                      <ExpiryTime expiresAt={entry.expiresAt} />
                    </span>
                  </p>
                </div>

                <span className="hidden w-24 shrink-0 truncate text-xs text-text-muted md:block">
                  {typeLabel(entry)}
                </span>
                <span className="hidden w-28 shrink-0 truncate text-xs text-text-subtle md:block">
                  <RelativeTime iso={entry.createdAt} />
                </span>
                <span className="hidden w-32 shrink-0 truncate text-xs text-text-subtle md:block">
                  <ExpiryTime expiresAt={entry.expiresAt} />
                </span>

                {/*
                  Revealed on hover on a pointer device, and always present for
                  keyboard users through focus-within — never removed from the
                  accessibility tree.
                */}
                <div className="flex shrink-0 items-center gap-1 md:w-[8.5rem] md:justify-end md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <LinkButton size="sm" variant="ghost" href={href}>
                    Open
                  </LinkButton>
                  {entry.editToken && !entry.burnAfterRead && !expired ? (
                    <LinkButton size="sm" variant="ghost" href={`/p/${entry.slug}/edit${fragment}`}>
                      <Pencil aria-hidden className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </LinkButton>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${entry.title || entry.slug} from this browser's history`}
                    onClick={() => {
                      forgetPaste(entry.slug);
                      toast('Removed from this browser', 'info');
                    }}
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {confirmingClear ? (
          <>
            <span className="text-xs text-text-muted">
              Remove all {entries.length} entries and their edit tokens from this browser?
            </span>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                clearHistory();
                setConfirmingClear(false);
                toast('Local history cleared', 'info');
              }}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              Clear everything
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(true)}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            Clear local history
          </Button>
        )}
      </div>
    </div>
  );
}

function Tag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border-base px-1.5 py-0.5 text-[11px] font-medium text-text-muted">
      <Icon aria-hidden className="h-3 w-3" strokeWidth={1.9} />
      {children}
    </span>
  );
}
