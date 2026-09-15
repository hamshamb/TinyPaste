import type { Metadata } from 'next';
import { RecentPasteList } from '@/components/paste/recent-paste-list';

export const metadata: Metadata = {
  title: 'Recent pastes',
  description: 'Pastes created from this browser.',
  robots: { index: false, follow: false },
};

export default function RecentPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="font-mono text-lg font-semibold tracking-tight">Your recent pastes</h1>
        <p className="text-sm text-text-muted">
          Stored in this browser only. Nothing here is a public feed, and the server keeps no list of who
          created what.
        </p>
      </div>
      <RecentPasteList />
    </div>
  );
}
