import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { sectionGroupId, UNGROUPED_GROUP } from './helpers/drag';
import {
  applyItemPatch,
  arrangeItems,
  getShoppingListQueryOptions,
  itemArrangement,
  remainingCount,
  type ShoppingListDetail,
  type ShoppingListItem,
  type ShoppingListSummary,
  toSectionsWithItems,
} from './shopping-lists.queries';

const item = (id: number, sectionId: number | null, label = `Item ${id}`) =>
  ({
    checkedAt: null,
    checkedBy: null,
    id,
    ingredientId: null,
    label,
    note: null,
    position: id,
    quantity: null,
    sectionId,
    unit: null,
  }) satisfies ShoppingListItem;

const section = (id: number, label: string) =>
  ({ id, label, position: id, storeId: id }) satisfies ShoppingListDetail['sections'][number];

const TIMESTAMPS = { createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' };

const detail = (sections: ShoppingListDetail['sections'], items: ShoppingListItem[]) =>
  ({
    ...TIMESTAMPS,
    completedAt: null,
    createdBy: null,
    householdId: 1,
    id: 1,
    items,
    label: 'Shopping list',
    name: null,
    sections,
  }) satisfies ShoppingListDetail;

const summary = (itemCount: number, checkedCount: number) =>
  ({
    ...TIMESTAMPS,
    checkedCount,
    completedAt: null,
    createdBy: null,
    householdId: 1,
    id: 1,
    itemCount,
    label: 'Shopping list',
    name: null,
  }) satisfies ShoppingListSummary;

const spar = section(10, 'Spar');
const hofer = section(20, 'Hofer');

describe('toSectionsWithItems', () => {
  it('should file each item under its section', () => {
    const result = toSectionsWithItems(detail([spar, hofer], [item(1, 10), item(2, 20), item(3, 10)]));

    expect(result.map(({ items, section }) => [section?.label, items.map((row) => row.id)])).toEqual([
      ['Spar', [1, 3]],
      ['Hofer', [2]],
    ]);
  });

  it('should sort the ungrouped bucket last', () => {
    // A heading you chose comes before the odds and ends that haven't found one.
    const result = toSectionsWithItems(detail([spar], [item(1, null), item(2, 10)]));

    expect(result.map(({ section }) => section?.label ?? null)).toEqual(['Spar', null]);
  });

  it('should omit the ungrouped bucket when nothing is in it', () => {
    expect(toSectionsWithItems(detail([spar], [item(1, 10)]))).toHaveLength(1);
  });

  it('should keep a section that holds no items', () => {
    // An empty shop still has to render — it is where you drop the next thing.
    const result = toSectionsWithItems(detail([spar, hofer], [item(1, 10)]));

    expect(result.map(({ items, section }) => [section?.label, items.length])).toEqual([
      ['Spar', 1],
      ['Hofer', 0],
    ]);
  });

  it('should handle a list with nothing on it', () => {
    expect(toSectionsWithItems(detail([], []))).toEqual([]);
  });

  it('should preserve the order items arrived in within a section', () => {
    const result = toSectionsWithItems(detail([spar], [item(3, 10), item(1, 10), item(2, 10)]));

    expect(result[0]?.items.map((row) => row.id)).toEqual([3, 1, 2]);
  });
});

describe('arrangeItems', () => {
  const items = [item(1, 10), item(2, 10), item(3, 20)];
  // dnd-kit addresses groups by string; `sectionGroupId` is what turns a section id into one, so the
  // arrangements below are keyed the way a real drag keys them rather than by a literal.
  const inSpar = sectionGroupId(10);
  const inHofer = sectionGroupId(20);

  it('should re-file an item into the section the arrangement puts it in', () => {
    const arranged = arrangeItems(items, { [inSpar]: [1], [inHofer]: [3, 2] });

    expect(arranged.find((row) => row.id === 2)?.sectionId).toBe(20);
  });

  it('should render in the arrangement’s order rather than the list’s', () => {
    const arranged = arrangeItems(items, { [inSpar]: [2, 1], [inHofer]: [3] });

    expect(arranged.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it('should keep an item the arrangement never saw', () => {
    // GIVEN: a row another member added while the drag was in flight
    const withNewRow = [...items, item(4, 10, 'Added mid-drag')];

    // WHEN: the in-flight arrangement is applied
    const arranged = arrangeItems(withNewRow, { [inSpar]: [1, 2], [inHofer]: [3] });

    // THEN: it should keep its place rather than vanishing until the drop
    expect(arranged.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });

  it('should ignore an id the list no longer holds', () => {
    // The mirror case: another member deleted a row mid-drag.
    const arranged = arrangeItems(items, { [inSpar]: [1, 99], [inHofer]: [3, 2] });

    expect(arranged.map((row) => row.id)).toEqual([1, 3, 2]);
  });

  it('should map the ungrouped group back to a null section', () => {
    const arranged = arrangeItems(items, { [UNGROUPED_GROUP]: [1], [inSpar]: [2], [inHofer]: [3] });

    expect(arranged.find((row) => row.id === 1)?.sectionId).toBeNull();
  });

  it('should not mutate the items it was given', () => {
    const before = JSON.stringify(items);

    arrangeItems(items, { [inSpar]: [1], [inHofer]: [3, 2] });

    expect(JSON.stringify(items)).toBe(before);
  });

  it('should round-trip an arrangement taken from the current grouping', () => {
    // GIVEN: the arrangement the pane is already rendering
    const grouped = toSectionsWithItems(detail([spar, hofer], items));

    // WHEN: it is applied back
    const arranged = arrangeItems(items, itemArrangement(grouped));

    // THEN: nothing should move
    expect(arranged.map((row) => [row.id, row.sectionId])).toEqual(items.map((row) => [row.id, row.sectionId]));
  });
});

describe('remainingCount', () => {
  it('should count what is still in the shop rather than the basket', () => {
    expect(remainingCount(summary(10, 3))).toBe(7);
    expect(remainingCount(summary(10, 10))).toBe(0);
  });
});

describe('applyItemPatch', () => {
  it('should rewrite just the item it names', () => {
    // GIVEN: a cached list of two items
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      getShoppingListQueryOptions(1).queryKey,
      detail([spar], [item(1, 10, 'Milk'), item(2, 10, 'Eggs')])
    );

    // WHEN: one of them is patched
    applyItemPatch(queryClient, 1, 1, { label: 'Oat milk' });

    // THEN: only that item should change
    expect(queryClient.getQueryData(getShoppingListQueryOptions(1).queryKey)?.items.map((row) => row.label)).toEqual([
      'Oat milk',
      'Eggs',
    ]);
  });

  it('should do nothing when the list is not cached', () => {
    // GIVEN: an empty cache, because nobody has the list open
    const queryClient = new QueryClient();

    // WHEN: an optimistic patch arrives
    applyItemPatch(queryClient, 1, 1, { label: 'Oat milk' });

    // THEN: it should not invent a cache entry
    expect(queryClient.getQueryData(getShoppingListQueryOptions(1).queryKey)).toBeUndefined();
  });
});
