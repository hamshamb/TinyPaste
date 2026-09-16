'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookText,
  Clock,
  CornerDownLeft,
  Eraser,
  FilePlus2,
  Search,
  ShieldQuestion,
  SunMoon,
  TextCursorInput,
  Zap,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils/cn';

/** Lets any chrome (the header button, for one) summon the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = 'tinypaste:open-palette';

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
};

/**
 * Ctrl/Cmd+K palette. Editor actions are dispatched as window events so the
 * palette stays decoupled from whichever page is mounted.
 */
export function CommandPalette() {
  const router = useRouter();
  const { cycle } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    // Return focus to wherever the user was before the palette opened.
    previouslyFocused.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: 'new',
        label: 'New paste',
        hint: 'Go to the editor',
        icon: FilePlus2,
        run: () => router.push('/'),
      },
      {
        id: 'create',
        label: 'Create paste',
        hint: 'Ctrl + Enter',
        icon: Zap,
        run: () => window.dispatchEvent(new CustomEvent('tinypaste:create-paste')),
      },
      {
        id: 'clear',
        label: 'Clear editor',
        icon: Eraser,
        run: () => window.dispatchEvent(new CustomEvent('tinypaste:clear-editor')),
      },
      {
        id: 'focus',
        label: 'Focus editor',
        icon: TextCursorInput,
        run: () => window.dispatchEvent(new CustomEvent('tinypaste:focus-editor')),
      },
      {
        id: 'recent',
        label: 'Recent pastes',
        hint: 'This browser only',
        icon: Clock,
        run: () => router.push('/recent'),
      },
      { id: 'theme', label: 'Toggle theme', icon: SunMoon, run: cycle },
      { id: 'about', label: 'About TinyPaste', icon: BookText, run: () => router.push('/about') },
      { id: 'privacy', label: 'Privacy', icon: ShieldQuestion, run: () => router.push('/privacy') },
    ],
    [cycle, router],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    const toggle = () => {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setOpen((current) => !current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, toggle);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, toggle);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = filtered[index];
    if (!command) return;
    close();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[14vh] tp-overlay tp-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-base bg-surface tp-shadow-pop tp-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-border-base px-3.5">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-text-subtle" strokeWidth={1.9} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % Math.max(filtered.length, 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + filtered.length) % Math.max(filtered.length, 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runAt(activeIndex);
              }
            }}
            placeholder="Type a command…"
            aria-label="Search commands"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-text-subtle"
          />
          <Kbd className="hidden shrink-0 sm:inline-flex">Esc</Kbd>
        </div>
        <ul className="max-h-[19rem] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-subtle">No matching command.</li>
          ) : (
            filtered.map((command, index) => {
              const active = index === activeIndex;
              const Icon = command.icon;
              return (
                <li key={command.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runAt(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] tp-transition',
                      active ? 'bg-surface-muted text-text-base' : 'text-text-muted',
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn('h-4 w-4 shrink-0', active && 'text-accent')}
                      strokeWidth={1.9}
                    />
                    <span className="flex-1 truncate font-medium">{command.label}</span>
                    {command.hint ? (
                      <span className="hidden text-[11px] text-text-subtle sm:inline">{command.hint}</span>
                    ) : null}
                    {active ? (
                      <CornerDownLeft aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
