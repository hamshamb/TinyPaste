'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DeletePasteDialogProps = {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmation before an irreversible delete. */
export function DeletePasteDialog({ open, deleting, onCancel, onConfirm }: DeletePasteDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, deleting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        className="w-full max-w-sm rounded-lg border border-border-base bg-surface p-5 tp-shadow"
      >
        <h2 id="delete-dialog-title" className="text-sm font-semibold">
          Delete this paste?
        </h2>
        <p id="delete-dialog-description" className="mt-1.5 text-sm text-text-muted">
          This cannot be undone. The link stops working immediately for everyone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant="danger"
            onClick={onConfirm}
            disabled={deleting}
            className="border-danger text-danger"
          >
            {deleting ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 aria-hidden className="h-4 w-4" />
                Delete paste
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
