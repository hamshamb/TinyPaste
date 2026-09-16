import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * Four roles, no decoration. The primary is the only filled surface in the app,
 * which is what makes "Create paste" unambiguous without making it loud.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast border border-transparent shadow-[0_1px_0_0_var(--tp-accent-line)] ' +
    'hover:bg-accent-hover disabled:hover:bg-accent',
  secondary:
    'bg-surface text-text-base border border-border-base hover:border-border-strong hover:bg-surface-muted',
  ghost:
    'bg-transparent text-text-muted border border-transparent hover:text-text-base hover:bg-surface-muted',
  danger: 'bg-transparent text-danger border border-border-base hover:bg-danger-soft hover:border-danger-line',
};

/* Minimum 40px tall on touch-sized variants so targets stay comfortable on phones. */
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3 text-[13px] gap-1.5 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
};

const BASE =
  'inline-flex select-none items-center justify-center font-medium tp-transition ' +
  'active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Explicit type: an unspecified button inside a form submits it.
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
});

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
};

/**
 * A link that looks like a button. Used where the action is a real navigation
 * (raw view, download) so it keeps working without JavaScript and supports
 * open-in-new-tab.
 */
export function LinkButton({ className, variant = 'secondary', size = 'md', href, ...props }: LinkButtonProps) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);
  // Raw and download responses are attachments/plain text, so they bypass the
  // client router deliberately.
  const isInternalRoute = href.startsWith('/') && !href.includes('/raw') && !href.includes('/download');
  if (isInternalRoute) {
    return <Link href={href} className={classes} {...props} />;
  }
  return <a href={href} className={classes} {...props} />;
}
