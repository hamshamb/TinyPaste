'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Flame, KeyRound, Lock, Pencil, Trash2, X } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/button';
import { ExpiryTime, RelativeTime } from '@/components/ui/time';
import { useToast } from '@/components/ui/toast';
import { buildFragment } from '@/lib/crypto/fragment';
import { clearHistory, forgetPaste, listHistory, subscribeHistory, type HistoryEntry } from '@/lib/client/history';
import { isExpired } from '@/lib/paste/expiration';
import { languageLabel } from '@/lib/paste/languages';

/**
 * Recent pastes.
 *
 * Reads only this browser's local history. There is no global feed and no
 * server-side listing endpoint at all — the server cannot enumerate pastes for
 * anyone, including us.
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
      <div className="rounded-lg border border-dashed border-border-base px-6 py-16 text-center">
        <p className="text-sm font-medium">No pastes from this browser yet.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-muted">
          Pastes you create are remembered here, on this device only. Clearing site data removes them along
          with their edit tokens.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-md border border-border-base bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
        >
          Create a paste
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const expired = isExpired(entry.expiresAt);
          // Encrypted links are only useful with their fragment key.
          const href = `/p/${entry.slug}${entry.encryptionKey ? `#${buildFragment(entry.encryptionKey)}` : ''}`;

          return (
            <li
              key={entry.slug}
              className="flex flex-col gap-2 rounded-lg border border-border-base bg-surface p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={href}
                    className="truncate font-mono text-sm font-medium transition-colors hover:text-accent"
                  >
                    {entry.title || 'Untitled'}
                  </Link>
                  {entry.isEncrypted ? <Tag icon={Lock}>Encrypted</Tag> : null}
                  {entry.isPasswordProtected ? <Tag icon={KeyRound}>Password</Tag> : null}
                  {entry.burnAfterRead ? <Tag icon={Flame}>Burn</Tag> : null}
                  {expired ? (
                    <span className="rounded-full border border-border-base px-2 py-0.5 text-[11px] font-medium text-text-subtle">
                      Expired
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-subtle">
                  <span className="font-mono">{entry.slug}</span>
                  <span aria-hidden>·</span>
                  <span>{languageLabel(entry.language)}</span>
                  <span aria-hidden>·</span>
                  <RelativeTime iso={entry.createdAt} prefix="Created " />
                  <span aria-hidden>·</span>
                  <ExpiryTime expiresAt={entry.expiresAt} />
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                <LinkButton size="sm" href={href}>
                  Open
                </LinkButton>
                {entry.editToken && !entry.burnAfterRead && !expired ? (
                  <LinkButton
                    size="sm"
                    href={`/p/${entry.slug}/edit${entry.encryptionKey ? `#${buildFragment(entry.encryptionKey)}` : ''}`}
                  >
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                    Edit
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
                  <span className="sr-only sm:not-sr-only">Remove</span>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 pt-1">
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

function Tag({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-base bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-text-muted">
      <Icon aria-hidden className="h-3 w-3" />
      {children}
    </span>
  );
}
