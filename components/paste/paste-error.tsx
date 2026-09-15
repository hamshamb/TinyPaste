import Link from 'next/link';
import { FileQuestion, Flame, TimerOff, TriangleAlert } from 'lucide-react';
import type { ErrorCode } from '@/lib/errors';

const STATES: Partial<Record<ErrorCode, { icon: typeof FileQuestion; title: string; detail: string }>> = {
  PASTE_NOT_FOUND: {
    icon: FileQuestion,
    title: 'Paste not found.',
    detail: 'This link does not match any paste. It may have been deleted, or the link may be incomplete.',
  },
  PASTE_EXPIRED: {
    icon: TimerOff,
    title: 'This paste has expired.',
    detail: 'Its lifetime ran out, so the contents are no longer available.',
  },
  PASTE_BURNED: {
    icon: Flame,
    title: 'This paste is no longer available.',
    detail: 'It was set to burn after reading and has already been opened once.',
  },
  INVALID_SLUG: {
    icon: FileQuestion,
    title: 'Paste not found.',
    detail: 'That link is not a valid paste address.',
  },
  STORAGE_UNAVAILABLE: {
    icon: TriangleAlert,
    title: 'Paste storage is not configured.',
    detail: 'The server has no database connection. See docs/SUPABASE_SETUP.md to finish the setup.',
  },
};

const FALLBACK = {
  icon: TriangleAlert,
  title: 'Something went wrong.',
  detail: 'The paste could not be loaded. Please try again in a moment.',
};

/** Shared empty state for every "you cannot see this" outcome. */
export function PasteErrorState({ code }: { code: ErrorCode }) {
  const state = STATES[code] ?? FALLBACK;
  const Icon = state.icon;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-surface text-text-muted">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <h1 className="text-base font-semibold">{state.title}</h1>
      <p className="mt-2 text-sm text-text-muted">{state.detail}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-md border border-border-base bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
      >
        Create a new paste
      </Link>
    </div>
  );
}
