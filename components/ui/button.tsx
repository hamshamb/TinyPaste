import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover border border-transparent disabled:hover:bg-accent',
  secondary:
    'bg-surface text-text-base border border-border-base hover:border-border-strong hover:bg-surface-muted',
  ghost: 'bg-transparent text-text-muted border border-transparent hover:text-text-base hover:bg-surface-muted',
  danger: 'bg-transparent text-danger border border-border-base hover:bg-danger-soft hover:border-danger',
};

/* Minimum 40px tall on touch-sized variants so targets stay comfortable on phones. */
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

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
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
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
  const classes = cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  // Raw and download responses are attachments/plain text, so they bypass the
  // client router deliberately.
  const isInternalRoute = href.startsWith('/') && !href.includes('/raw') && !href.includes('/download');
  if (isInternalRoute) {
    return <Link href={href} className={classes} {...props} />;
  }
  return <a href={href} className={classes} {...props} />;
}
