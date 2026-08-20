import { type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { type PermissionArea } from '@homewise/server/permissions';

import { serverMessage } from '../helpers';
import { useCan } from './use-can';

/**
 * The half of an inline editor that is the same in every domain: two ways to call one mutation, and
 * whether this member may call it at all.
 *
 * `save` rejects, which is what an `InlineTextField` needs — a refusal has to keep the editor open
 * over the value the server would not take. `saveOrToast` swallows into a toast instead, for the
 * live controls that have no form and so nowhere to hang a message: a select, a popover, a toggle.
 *
 * `readOnly` is what the cells render from. It is also enforced here rather than only there: a cell
 * that slipped through the gating would otherwise fire a request that can only 403, so in development
 * that throws and names the area instead of failing quietly in a toast.
 *
 * Each domain still writes its own mutation — the endpoint, the optimistic cache write and which
 * lists an edit invalidates are all genuinely per-domain. This is only what surrounded them.
 */
export function useInlinePatch<Payload, Result>(
  area: PermissionArea,
  mutation: Pick<UseMutationResult<Result, Error, Payload>, 'isPending' | 'mutateAsync'>
) {
  const { isPending, mutateAsync } = mutation;
  const readOnly = !useCan(area, 'write');

  const refuse = () => {
    if (import.meta.env.DEV) {
      throw new Error(`useInlinePatch: a ${area} write was attempted by a member who cannot make one`);
    }

    toast.error('You do not have permission to change this.');
  };

  const save = async (payload: Payload) => {
    if (readOnly) {
      return refuse();
    }

    return await mutateAsync(payload);
  };

  const saveOrToast = async (payload: Payload) => {
    try {
      await save(payload);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, readOnly, save, saveOrToast };
}
