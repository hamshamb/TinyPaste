import type { Metadata } from 'next';
import { EditPasteForm } from '@/components/editor/edit-paste-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit paste',
  robots: { index: false, follow: false },
};

export default async function EditPastePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="font-mono text-lg font-semibold tracking-tight">Edit paste</h1>
        <p className="text-sm text-text-muted">
          Only this browser can make changes, using the edit token stored when the paste was created.
        </p>
      </div>
      {/* Loading and authorisation both happen client-side: the edit token
          never leaves local storage until it is sent with the request. */}
      <EditPasteForm slug={slug} />
    </div>
  );
}
