'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Plus, Search } from 'lucide-react';
import { site } from '@/lib/config/site';
import { cn } from '@/lib/utils/cn';
import { LogoMark } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Kbd, useModifierLabel } from '@/components/ui/kbd';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/command-palette';

/**
 * A single row of chrome: identity on the left, three controls on the right.
 *
 * About and Privacy live in the footer and the command palette — they are
 * documentation, and putting them in the toolbar of a tool competes with the
 * only two things a visitor does here (write a paste, find an old one).
 */
export function Header() {
  const pathname = usePathname();
  const modifier = useModifierLabel();
  const onEditor = pathname === '/';

  return (
    <header className="sticky top-0 z-40 border-b border-border-base bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-6xl items-center gap-2 px-3 sm:px-5">
        <Link
          href="/"
          aria-label={`${site.name} home`}
          className="group flex shrink-0 items-center gap-2 rounded-md py-1 pr-1"
        >
          <LogoMark className="tp-transition group-hover:scale-105" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">{site.name}</span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {/* Redundant on the editor itself, so it only appears elsewhere. */}
          {onEditor ? null : (
            <Link
              href="/"
              aria-label="New paste"
              title="New paste"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-text-muted tp-transition hover:bg-surface-muted hover:text-text-base sm:h-8 sm:w-auto sm:px-2"
            >
              <Plus aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
              <span className="hidden sm:inline">New</span>
            </Link>
          )}

          <Link
            href="/recent"
            aria-current={pathname.startsWith('/recent') ? 'page' : undefined}
            aria-label="Recent pastes"
            title="Recent pastes"
            className={cn(
              'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium tp-transition sm:h-8 sm:w-auto',
              pathname.startsWith('/recent')
                ? 'bg-surface-muted text-text-base'
                : 'text-text-muted hover:bg-surface-muted hover:text-text-base',
            )}
          >
            <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
            <span className="hidden sm:inline">Recent</span>
          </Link>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))}
            aria-label="Open the command palette"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border-base bg-surface px-2.5 text-[13px] text-text-muted tp-transition hover:border-border-strong hover:text-text-base active:scale-[0.98] sm:h-8 sm:px-2"
          >
            <Search aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
            {/*
              A single hidden/sm:inline-flex wrapper, not that responsive
              class stacked directly onto <Kbd>: Kbd's own base className
              already hard-codes `inline-flex`, and this project's `cn()` is a
              plain joiner with no Tailwind conflict resolution — a later
              `hidden` utility does not reliably beat an earlier unconditional
              `inline-flex` of the same specificity, which is exactly what let
              this "Ctrl K" hint leak onto touch-first layouts before.
            */}
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              Command
              <Kbd>{modifier}K</Kbd>
            </span>
          </button>

          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
