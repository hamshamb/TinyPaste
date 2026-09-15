import type { Metadata } from 'next';
import { PasteEditor } from '@/components/editor/paste-editor';
import { site } from '@/lib/config/site';

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
};

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-mono text-lg font-semibold tracking-tight">New paste</h1>
        <p className="text-sm text-text-muted">
          No account, no tracking. Choose how long it lives and who can read it.
        </p>
      </div>
      <PasteEditor />
    </div>
  );
}
