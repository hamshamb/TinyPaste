import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-mono text-xs tracking-[0.1em] text-text-subtle">404</p>
      <h1 className="mt-2 text-[15px] font-semibold">Page not found.</h1>
      <p className="mt-2 text-[13px] text-text-muted">
        That address does not exist here. If you followed a paste link, check that it was copied in full.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center rounded-md border border-border-base bg-surface px-3.5 text-[13px] font-medium tp-transition hover:border-border-strong hover:bg-surface-muted"
      >
        Create a new paste
      </Link>
    </div>
  );
}
