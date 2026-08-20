import { useMutation, useQueryClient } from '@tanstack/react-query';

import { parseResponse } from '@/api/client';
import { useInlinePatch } from '@/modules/shared';

import { $patchStore, applyStoreUpdate, invalidateStores, type PatchStorePayload } from '../stores.queries';

/**
 * Patches one shop from an inline editor. Takes the id once, at mount, so a save addresses the shop
 * the editor was opened on rather than whatever now occupies its position.
 */
export function useInlineStorePatch(storeId: number) {
  const queryClient = useQueryClient();

  return useInlinePatch(
    'stores',
    useMutation({
      mutationFn: async (json: PatchStorePayload) =>
        parseResponse($patchStore({ param: { id: storeId.toString() }, json })),
      onSuccess: (updated) => {
        applyStoreUpdate(queryClient, updated);
        invalidateStores(queryClient);
      },
    })
  );
}
