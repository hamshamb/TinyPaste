import type { Metadata } from 'next';
import Link from 'next/link';
import { EditPasteForm } from '@/components/editor/edit-paste-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit paste',
  robots: { index: false, follow: false },
};

export default async function EditPastePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-3 sm:px-5 sm:py-4">
      <h1 className="sr-only">Edit paste</h1>
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 px-0.5 text-xs text-text-subtle">
        <Link href="/" className="rounded tp-transition hover:text-text-base">
          TinyPaste
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/p/${slug}`} className="rounded font-mono text-text-muted tp-transition hover:text-text-base">
          {slug}
        </Link>
        <span aria-hidden>/</span>
        <span>edit</span>
      </nav>
      {/* Loading and authorisation both happen client-side: the edit token
          never leaves local storage until it is sent with the request. */}
      <EditPasteForm slug={slug} />
    </div>
  );
}
