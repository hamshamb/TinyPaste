import { cn } from '@/lib/utils/cn';

/**
 * The TinyPaste mark: a prompt caret and a cursor rule inside a soft square.
 *
 * Deliberately geometric and tiny — it has to hold up at 20px in a header and
 * read as a tool, not as an illustration. It draws from the palette variables
 * so it recolours with the theme without a second asset.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn('h-[22px] w-[22px] shrink-0', className)}
    >
      <rect
        x="0.75"
        y="0.75"
        width="22.5"
        height="22.5"
        rx="6.75"
        fill="var(--tp-accent-soft)"
        stroke="var(--tp-accent-line)"
        strokeWidth="1.5"
      />
      <path
        d="M7.6 8.4 10.9 12l-3.3 3.6"
        stroke="var(--tp-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 15.6h3.4"
        stroke="var(--tp-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
