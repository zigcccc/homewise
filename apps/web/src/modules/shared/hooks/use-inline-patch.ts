import { type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { serverMessage } from '../helpers';

/**
 * The half of an inline editor that is the same in every domain: two ways to call one mutation.
 *
 * `save` rejects, which is what an `InlineTextField` needs — a refusal has to keep the editor open
 * over the value the server would not take. `saveOrToast` swallows into a toast instead, for the
 * live controls that have no form and so nowhere to hang a message: a select, a popover, a toggle.
 *
 * Each domain still writes its own mutation — the endpoint, the optimistic cache write and which
 * lists an edit invalidates are all genuinely per-domain. This is only what surrounded them.
 */
export function useInlinePatch<Payload, Result>(
  mutation: Pick<UseMutationResult<Result, Error, Payload>, 'isPending' | 'mutateAsync'>
) {
  const { isPending, mutateAsync: save } = mutation;

  const saveOrToast = async (payload: Payload) => {
    try {
      await save(payload);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}
