'use client';

import { FileCode2, FileText, NotebookText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ContentTypeId } from '@/lib/paste/content-type';

const MODES: Array<{ id: ContentTypeId; label: string; icon: LucideIcon }> = [
  { id: 'code', label: 'Code', icon: FileCode2 },
  { id: 'plaintext', label: 'Text', icon: FileText },
  { id: 'document', label: 'Document', icon: NotebookText },
];

export function ModeTabs({
  value,
  onChange,
  disabled,
}: {
  value: ContentTypeId;
  onChange: (mode: ContentTypeId) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Content type"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border-base bg-surface p-0.5"
    >
      {MODES.map((mode) => {
        const active = mode.id === value;
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium tp-transition',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:text-text-base',
            )}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
