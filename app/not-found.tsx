import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-text-subtle">404</p>
      <h1 className="mt-2 text-base font-semibold">Page not found.</h1>
      <p className="mt-2 text-sm text-text-muted">
        That address does not exist here. If you followed a paste link, check that it was copied in full.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-md border border-border-base bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
      >
        Create a new paste
      </Link>
    </div>
  );
}
