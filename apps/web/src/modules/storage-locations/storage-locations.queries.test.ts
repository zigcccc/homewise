import { describe, expect, it } from 'vitest';

import { type StorageLocation, toLocationOptions } from './storage-locations.queries';

/**
 * The projection behind the "Move to" menu, and the one property that makes it worth having: a
 * change to a location's *counts* must not change what a picker sees.
 *
 * That's what lets TanStack's structural sharing hand back the same array on a refetch, which in
 * turn is what keeps `DataTable` from rebuilding its columns — and `flexRender` treats a column's
 * `cell` as a component type, so a rebuilt column array remounts every cell and closes whatever menu
 * or inline editor was open in one. Drop the projection and that comes straight back.
 */

const location = (overrides: Partial<StorageLocation> = {}): StorageLocation => ({
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  householdId: 1,
  id: 1,
  itemCount: 0,
  latitude: null,
  longitude: null,
  name: 'Garage',
  onLoanCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('toLocationOptions', () => {
  it('should keep only what a picker renders', () => {
    expect(toLocationOptions([location({ address: 'Somewhere', id: 7, itemCount: 12, name: 'Cellar' })])).toEqual([
      { id: 7, name: 'Cellar' },
    ]);
  });

  it('should be unchanged by a count that moved', () => {
    // GIVEN: the same locations before and after somebody stored something
    const before = [location({ id: 1, itemCount: 3 }), location({ id: 2, itemCount: 0, name: 'Cellar' })];
    const after = [
      location({ id: 1, itemCount: 4 }),
      location({ id: 2, itemCount: 0, name: 'Cellar', onLoanCount: 1 }),
    ];

    // THEN: the projection should be deep-equal, which is what structural sharing needs to return
    // the previous array by reference and leave every consumer un-rendered
    expect(toLocationOptions(after)).toEqual(toLocationOptions(before));
  });

  it('should change when a location is renamed, added or removed', () => {
    const before = [location({ id: 1 })];

    expect(toLocationOptions([location({ id: 1, name: 'Big garage' })])).not.toEqual(toLocationOptions(before));
    expect(toLocationOptions([location({ id: 1 }), location({ id: 2, name: 'Cellar' })])).not.toEqual(
      toLocationOptions(before)
    );
    expect(toLocationOptions([])).not.toEqual(toLocationOptions(before));
  });
});
