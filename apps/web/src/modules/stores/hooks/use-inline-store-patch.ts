import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import { $patchStore, applyStoreUpdate, invalidateStores, type PatchStorePayload } from '../stores.queries';

/**
 * Patches one shop from an inline editor. Takes the id once, at mount, so a save addresses the shop
 * the editor was opened on rather than whatever now occupies its position.
 *
 * `save` throws, which is what an `InlineTextField` needs to keep the editor open on a refusal;
 * `saveOrToast` swallows and reports, for the controls that have nowhere to show a message.
 */
export function useInlineStorePatch(storeId: number) {
  const queryClient = useQueryClient();

  const { isPending, mutateAsync: save } = useMutation({
    mutationFn: async (json: PatchStorePayload) =>
      parseResponse($patchStore({ param: { id: storeId.toString() }, json })),
    onSuccess: (updated) => {
      applyStoreUpdate(queryClient, updated);
      invalidateStores(queryClient);
    },
  });

  const saveOrToast = async (json: PatchStorePayload) => {
    try {
      await save(json);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}
