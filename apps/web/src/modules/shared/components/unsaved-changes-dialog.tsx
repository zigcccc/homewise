import { useBlocker } from '@tanstack/react-router';

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
 * Warns before leaving the route while `when` is true — i.e. a form has unsaved edits. Also arms the
 * native beforeunload prompt for a hard reload / tab close. "Stay" cancels the navigation; "Leave"
 * lets it through, discarding the pending edits. Drop one next to each form: `when={form.formState.isDirty}`.
 */
export function UnsavedChangesDialog({ when }: { when: boolean }) {
  const blocker = useBlocker({ shouldBlockFn: () => when, enableBeforeUnload: when, withResolver: true });

  return (
    <Dialog onOpenChange={(open) => !open && blocker.reset?.()} open={blocker.status === 'blocked'}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>Some changes haven’t been saved yet. If you leave now, they’ll be lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => blocker.reset?.()} variant="outline">
            Stay
          </Button>
          <Button onClick={() => blocker.proceed?.()} variant="destructive">
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
