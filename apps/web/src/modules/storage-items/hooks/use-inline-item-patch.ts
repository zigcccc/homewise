import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';
import { invalidateStorageLocations } from '@/modules/storage-locations';

import {
  $patchStorageItem,
  applyStorageItemUpdate,
  invalidateStorageItems,
  type PatchStorageItemPayload,
} from '../storage-items.queries';

/**
 * Patches one item from an inline editor. Takes the id once, at mount, so a save addresses the item
 * the editor was opened on rather than whatever now occupies its position.
 *
 * `save` throws, which is what an `InlineTextField` needs to keep the editor open on a refusal;
 * `saveOrToast` swallows and reports, for the controls that have nowhere to show a message.
 */
export function useInlineItemPatch(itemId: number) {
  const queryClient = useQueryClient();

  const { isPending, mutateAsync: save } = useMutation({
    mutationFn: async (form: PatchStorageItemPayload) =>
      parseResponse($patchStorageItem({ param: { id: itemId.toString() }, form })),
    onSuccess: (updated) => {
      applyStorageItemUpdate(queryClient, updated);
      invalidateStorageItems(queryClient);
      // A move changes both locations' counts; every other edit leaves them alone but costs one
      // refetch of a list that is usually not even mounted.
      invalidateStorageLocations(queryClient);
    },
  });

  const saveOrToast = async (form: PatchStorageItemPayload) => {
    try {
      await save(form);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}
