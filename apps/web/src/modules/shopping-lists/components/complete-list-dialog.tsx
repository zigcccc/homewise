import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homewise/ui/core';

/**
 * Marking a list done while things are still unticked.
 *
 * Three ways out rather than the usual two, which is why this isn't `ConfirmDeleteDialog`: the
 * middle one keeps the forgotten items instead of losing them with the trip they belonged to, and
 * it's the option most people actually want. Skip this dialog entirely when nothing is unticked —
 * there's nothing to decide.
 */
export function CompleteListDialog({
  onConfirm,
  onOpenChange,
  open,
  remaining,
}: {
  onConfirm: (unchecked: 'carry-over' | 'discard') => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  remaining: number;
}) {
  const [pending, setPending] = useState<'carry-over' | 'discard' | null>(null);

  const confirm = async (unchecked: 'carry-over' | 'discard') => {
    setPending(unchecked);
    try {
      await onConfirm(unchecked);
      onOpenChange(false);
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this list as done?</DialogTitle>
          <DialogDescription>
            {remaining === 1 ? '1 item is' : `${remaining} items are`} still unticked. You can keep{' '}
            {remaining === 1 ? 'it' : 'them'} for next time, or finish the list anyway.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button loading={pending === 'carry-over'} onClick={() => confirm('carry-over')}>
            Move to a new list
          </Button>
          <Button loading={pending === 'discard'} onClick={() => confirm('discard')} variant="outline">
            Finish anyway
          </Button>
          <Button disabled={pending !== null} onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
