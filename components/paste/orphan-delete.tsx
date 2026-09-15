'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeletePasteDialog } from '@/components/paste/delete-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError, deletePaste } from '@/lib/client/api';
import { forgetPaste, getHistoryEntry, subscribeHistory } from '@/lib/client/history';

/**
 * Offers deletion on the "expired" and "burned" screens.
 *
 * Those pastes are unreadable, so the normal viewer — and its Delete button —
 * never renders. Without this the creator has no way to remove the row, which
 * still holds metadata such as the title, and for a burned paste that never
 * expires the cleanup job would never reach it either.
 *
 * Renders nothing unless this browser holds the edit token. That is only a UI
 * hint; the server verifies the token again on the request.
 */
export function OrphanDelete({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  const editToken = useSyncExternalStore(
    subscribeHistory,
    () => getHistoryEntry(slug)?.editToken ?? null,
    () => null,
  );

  const confirm = useCallback(async () => {
    if (!editToken) return;
    setDeleting(true);
    try {
      await deletePaste(slug, editToken);
      forgetPaste(slug);
      setDone(true);
      setOpen(false);
      toast('Paste deleted', 'success');
      // Deliberately no router.refresh(): re-rendering would resolve the page to
      // "not found" and unmount this component along with its confirmation.
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not delete this paste.', 'error');
      setDeleting(false);
      setOpen(false);
    }
  }, [editToken, slug, toast]);

  if (done) {
    return (
      <p role="status" className="mt-6 text-sm text-text-muted">
        Deleted. Nothing for this link remains stored.
      </p>
    );
  }

  if (!editToken) return null;

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-xs text-text-subtle">
        You created this paste in this browser. Its contents are already gone, but the record is still
        stored.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={deleting}>
        {deleting ? (
          <>
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Deleting…
          </>
        ) : (
          <>
            <Trash2 aria-hidden className="h-4 w-4" />
            Delete permanently
          </>
        )}
      </Button>

      <DeletePasteDialog
        open={open}
        deleting={deleting}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </div>
  );
}
