'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { site } from '@/lib/config/site';
import { cn } from '@/lib/utils/cn';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/** `shortLabel` keeps the bar on one line at phone widths. */
const NAV_ITEMS = [
  { href: '/', label: 'New Paste', shortLabel: 'New' },
  { href: '/recent', label: 'Recent', shortLabel: 'Recent' },
  { href: '/about', label: 'About', shortLabel: 'About' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border-base bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md font-mono text-[15px] font-semibold tracking-tight"
        >
          <span aria-hidden className="text-accent">
            ▍
          </span>
          <span>{site.name}</span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors sm:px-2.5',
                  active ? 'bg-surface-muted text-text-base' : 'text-text-muted hover:text-text-base',
                )}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
          <span aria-hidden className="mx-1 h-5 w-px bg-border-base" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
