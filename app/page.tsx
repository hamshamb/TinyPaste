import type { Metadata } from 'next';
import { PasteEditor } from '@/components/editor/paste-editor';
import { site } from '@/lib/config/site';

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
};

/**
 * The editor is the whole page. There is no hero, no marketing copy and no
 * heading above it: the caret is already blinking in the only field that
 * matters, and everything else is a toolbar around that.
 */
export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 py-3 sm:px-5 sm:py-4">
      <h1 className="sr-only">New paste</h1>
      <PasteEditor />
    </div>
  );
}
