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
  it('files each item under its section', () => {
    const result = toSectionsWithItems(detail([spar, hofer], [item(1, 10), item(2, 20), item(3, 10)]));

    expect(result.map(({ items, section }) => [section?.label, items.map((row) => row.id)])).toEqual([
      ['Spar', [1, 3]],
      ['Hofer', [2]],
    ]);
  });

  it('sorts the ungrouped bucket last', () => {
    // A heading you chose comes before the odds and ends that haven't found one.
    const result = toSectionsWithItems(detail([spar], [item(1, null), item(2, 10)]));

    expect(result.map(({ section }) => section?.label ?? null)).toEqual(['Spar', null]);
  });

  it('omits the ungrouped bucket when nothing is in it', () => {
    const result = toSectionsWithItems(detail([spar], [item(1, 10)]));

    expect(result).toHaveLength(1);
  });

  it('keeps a section that holds no items', () => {
    // An empty shop still has to render — it is where you drop the next thing.
    const result = toSectionsWithItems(detail([spar, hofer], [item(1, 10)]));

    expect(result.map(({ items, section }) => [section?.label, items.length])).toEqual([
      ['Spar', 1],
      ['Hofer', 0],
    ]);
  });

  it('handles a list with nothing on it', () => {
    expect(toSectionsWithItems(detail([], []))).toEqual([]);
  });

  it('preserves the order items arrived in within a section', () => {
    const result = toSectionsWithItems(detail([spar], [item(3, 10), item(1, 10), item(2, 10)]));

    expect(result[0]?.items.map((row) => row.id)).toEqual([3, 1, 2]);
  });
});

describe('arrangeItems', () => {
  const items = [item(1, 10), item(2, 10), item(3, 20)];
  // dnd-kit addresses groups by string; `sectionGroupId` is what turns a section id into one, so the
  // arrangements below are keyed the way a real drag keys them rather than by a literal that agrees today.
  const inSpar = sectionGroupId(10);
  const inHofer = sectionGroupId(20);

  it('re-files an item into the section the arrangement puts it in', () => {
    const arranged = arrangeItems(items, { [inSpar]: [1], [inHofer]: [3, 2] });

    expect(arranged.find((row) => row.id === 2)?.sectionId).toBe(20);
  });

  it('renders in the arrangement’s order, not the list’s', () => {
    const arranged = arrangeItems(items, { [inSpar]: [2, 1], [inHofer]: [3] });

    expect(arranged.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it('keeps an item the arrangement never saw', () => {
    // A row another member added while the drag was in flight. Dropping it would make it vanish from
    // the pane until the drop lands.
    const withNewRow = [...items, item(4, 10, 'Added mid-drag')];
    const arranged = arrangeItems(withNewRow, { [inSpar]: [1, 2], [inHofer]: [3] });

    expect(arranged.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });

  it('ignores an id the list no longer holds', () => {
    // The mirror case: another member deleted a row mid-drag.
    const arranged = arrangeItems(items, { [inSpar]: [1, 99], [inHofer]: [3, 2] });

    expect(arranged.map((row) => row.id)).toEqual([1, 3, 2]);
  });

  it('maps the ungrouped group back to a null section', () => {
    const arranged = arrangeItems(items, { [UNGROUPED_GROUP]: [1], [inSpar]: [2], [inHofer]: [3] });

    expect(arranged.find((row) => row.id === 1)?.sectionId).toBeNull();
  });

  it('does not mutate the items it was given', () => {
    const before = JSON.stringify(items);

    arrangeItems(items, { [inSpar]: [1], [inHofer]: [3, 2] });

    expect(JSON.stringify(items)).toBe(before);
  });

  it('round-trips an arrangement taken from the current grouping', () => {
    const grouped = toSectionsWithItems(detail([spar, hofer], items));
    const arranged = arrangeItems(items, itemArrangement(grouped));

    expect(arranged.map((row) => [row.id, row.sectionId])).toEqual(items.map((row) => [row.id, row.sectionId]));
  });
});

describe('remainingCount', () => {
  it('counts what is still in the shop rather than the basket', () => {
    expect(remainingCount(summary(10, 3))).toBe(7);
    expect(remainingCount(summary(10, 10))).toBe(0);
  });
});

describe('applyItemPatch', () => {
  it('rewrites just the item it names', () => {
    const queryClient = new QueryClient();
    const list = detail([spar], [item(1, 10, 'Milk'), item(2, 10, 'Eggs')]);
    queryClient.setQueryData(getShoppingListQueryOptions(1).queryKey, list);

    applyItemPatch(queryClient, 1, 1, { label: 'Oat milk' });

    const updated = queryClient.getQueryData(getShoppingListQueryOptions(1).queryKey);
    expect(updated?.items.map((row) => row.label)).toEqual(['Oat milk', 'Eggs']);
  });

  it('does nothing when the list is not cached', () => {
    // The optimistic half of ticking something off, and it must not invent a cache entry.
    const queryClient = new QueryClient();

    applyItemPatch(queryClient, 1, 1, { label: 'Oat milk' });

    expect(queryClient.getQueryData(getShoppingListQueryOptions(1).queryKey)).toBeUndefined();
  });
});
