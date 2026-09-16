'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type InlineSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  icon?: LucideIcon;
  options: ReadonlyArray<{ value: string; label: string }>;
  containerClassName?: string;
};

/**
 * A native select dressed as a toolbar control.
 *
 * Still a real <select>: the platform picker is better on touch than anything
 * we would rebuild, and it keeps label, keyboard behaviour and screen-reader
 * semantics for free. Only the chrome is ours.
 */
export function InlineSelect({
  label,
  icon: Icon,
  options,
  className,
  containerClassName,
  ...props
}: InlineSelectProps) {
  const id = useId();

  return (
    <div className={cn('relative inline-flex min-w-0 items-center', containerClassName)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {Icon ? (
        <Icon
          aria-hidden
          className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-text-subtle"
          strokeWidth={1.9}
        />
      ) : null}
      <select
        id={id}
        className={cn(
          'h-8 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border border-transparent bg-transparent',
          'text-[13px] font-medium text-text-muted tp-transition hover:bg-surface-muted hover:text-text-base',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&>option]:bg-surface [&>option]:text-text-base',
          Icon ? 'pl-7 pr-6' : 'pl-2.5 pr-6',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-text-subtle"
        strokeWidth={1.9}
      />
    </div>
  );
}
