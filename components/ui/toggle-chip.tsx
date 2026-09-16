'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Tone = 'accent' | 'warning';

type ToggleChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onToggle'> & {
  icon: LucideIcon;
  label: string;
  pressed: boolean;
  tone?: Tone;
  onToggle: (next: boolean) => void;
};

const SELECTED: Record<Tone, string> = {
  accent: 'border-accent-line bg-accent-soft text-accent',
  warning: 'border-warning-line bg-warning-soft text-warning',
};

/**
 * A compact on/off control for the editor toolbar.
 *
 * `aria-pressed` rather than a checkbox: these are toolbar toggles that change
 * the state of the thing being composed, and the pressed state is announced
 * without needing a visible label/description pair for each one. The selected
 * state is carried by border, fill and icon together, never by colour alone.
 */
export const ToggleChip = forwardRef<HTMLButtonElement, ToggleChipProps>(function ToggleChip(
  { icon: Icon, label, pressed, tone = 'accent', onToggle, className, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onToggle(!pressed)}
      className={cn(
        'inline-flex h-8 select-none items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium',
        'tp-transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        pressed
          ? SELECTED[tone]
          : 'border-transparent text-text-muted hover:bg-surface-muted hover:text-text-base',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={pressed ? 2.25 : 1.9} />
      {label}
    </button>
  );
});
