'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Eraser, FilePlus2, Search, SunMoon, TextCursorInput, Zap } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils/cn';

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
    ],
    [cycle, router],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-md overflow-hidden rounded-lg border border-border-base bg-surface tp-shadow"
      >
        <div className="flex items-center gap-2 border-b border-border-base px-3">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-text-subtle" />
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
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-subtle">No matching command.</li>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              return (
                <li key={command.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runAt(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                      index === activeIndex ? 'bg-surface-muted text-text-base' : 'text-text-muted',
                    )}
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{command.label}</span>
                    {command.hint ? (
                      <span className="font-mono text-[11px] text-text-subtle">{command.hint}</span>
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
