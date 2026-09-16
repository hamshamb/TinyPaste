import type { Metadata } from 'next';
import { RecentPasteList } from '@/components/paste/recent-paste-list';

export const metadata: Metadata = {
  title: 'Recent pastes',
  description: 'Pastes created from this browser.',
  robots: { index: false, follow: false },
};

export default function RecentPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 sm:py-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Recent pastes</h1>
        <p className="text-xs text-text-subtle">
          This browser only. The server keeps no list of who created what.
        </p>
      </div>
      <RecentPasteList />
    </div>
  );
}
