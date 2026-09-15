'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

const CONTROL_CLASSES =
  'h-10 w-full rounded-md border border-border-base bg-surface px-3 text-sm text-text-base ' +
  'placeholder:text-text-subtle transition-colors hover:border-border-strong ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

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
      <label htmlFor={id} className={cn('text-xs font-medium text-text-muted', labelHidden && 'sr-only')}>
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
        className={cn(CONTROL_CLASSES, 'cursor-pointer pr-8', error && 'border-danger', className)}
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

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
  description?: ReactNode;
};

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? `${id}-description` : undefined}
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-border-strong accent-[var(--tp-accent)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text-base">
          {label}
        </label>
        {description ? (
          <p id={`${id}-description`} className="text-xs text-text-subtle">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
