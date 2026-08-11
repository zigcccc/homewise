import { type StorageItemSortKey } from '@homewise/server/storage-items';

import { SORT_LABELS, type SortDirectionLabels } from '@/modules/shared';

/**
 * Ascending reads differently per column: A → Z for a name, oldest-first for a date. The global
 * table and a location's own list sort by the same three keys, so the direction reads the same words
 * in both — this lives here rather than in either route for that reason.
 */
export const STORAGE_ITEM_SORT_DIRECTION_LABELS: Record<StorageItemSortKey, SortDirectionLabels> = {
  name: SORT_LABELS.text,
  createdAt: SORT_LABELS.date,
  dueOn: SORT_LABELS.date,
};
