'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-base',
        'bg-surface-muted px-1 font-mono text-[10px] font-medium leading-none text-text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** The platform never changes while the page is open, so there is nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

function readModifier(): string {
  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.platform} ${navigator.userAgent}`) ? '⌘' : 'Ctrl';
}

/**
 * "Ctrl", or the Command glyph on Apple hardware.
 *
 * The platform is only knowable in the browser. Reading it through an external
 * store lets React resolve the real value during hydration instead of painting
 * once and correcting itself in an effect.
 */
export function useModifierLabel(): string {
  return useSyncExternalStore(subscribe, readModifier, () => 'Ctrl');
}
