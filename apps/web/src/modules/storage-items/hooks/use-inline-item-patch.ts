import { useMutation, useQueryClient } from '@tanstack/react-query';

import { parseResponse } from '@/api/client';
import { useInlinePatch } from '@/modules/shared';
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
 */
export function useInlineItemPatch(itemId: number) {
  const queryClient = useQueryClient();

  return useInlinePatch(
    'storageItems',
    useMutation({
      mutationFn: async (form: PatchStorageItemPayload) =>
        parseResponse($patchStorageItem({ param: { id: itemId.toString() }, form })),
      onSuccess: (updated) => {
        applyStorageItemUpdate(queryClient, updated);
        invalidateStorageItems(queryClient);
        // A move changes both locations' counts; every other edit leaves them alone but costs one
        // refetch of a list that is usually not even mounted.
        invalidateStorageLocations(queryClient);
      },
    })
  );
}
