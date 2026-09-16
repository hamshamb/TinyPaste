'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

const CONTROL_CLASSES =
  'h-10 w-full rounded-md border border-border-base bg-bg px-3 text-sm text-text-base ' +
  'placeholder:text-text-subtle tp-transition hover:border-border-strong ' +
  'focus:border-accent-line disabled:cursor-not-allowed disabled:opacity-60';

type FieldShellProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  labelHidden?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Shared label/hint/error scaffolding. The error is wired to the control with
 * aria-describedby and repeated as text, so status is never colour-only.
 */
export function FieldShell({ id, label, hint, error, labelHidden, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn(
          'text-[11px] font-medium uppercase tracking-[0.06em] text-text-subtle',
          labelHidden && 'sr-only',
        )}
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  labelHidden?: boolean;
  containerClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, labelHidden, className, containerClassName, ...props },
  ref,
) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelHidden={labelHidden}
      className={containerClassName}
    >
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(CONTROL_CLASSES, error && 'border-danger', className)}
        {...props}
      />
    </FieldShell>
  );
});

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  labelHidden?: boolean;
  containerClassName?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, labelHidden, className, containerClassName, options, ...props },
  ref,
) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelHidden={labelHidden}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          CONTROL_CLASSES,
          'cursor-pointer pr-8 [&>option]:bg-surface [&>option]:text-text-base',
          error && 'border-danger',
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
    </FieldShell>
  );
});
