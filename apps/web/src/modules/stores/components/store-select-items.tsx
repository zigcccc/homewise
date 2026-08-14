import { useSuspenseQuery } from '@tanstack/react-query';

import { SelectItem } from '@homewise/ui/core';

import { SELECT_NONE } from '@/modules/shared';

import { listStoreOptionsQueryOptions } from '../stores.queries';

/**
 * The household's shops, for any `SelectContent` that picks one. Unlike the ingredient category and
 * unit lists these aren't a fixed enum, so this reads them from the cache — `SelectContent` only
 * mounts once opened, and every route that shows a shop picker warms the list in its loader.
 *
 * `noneLabel` adds the "no shop" option on top; the wording differs by context ("None" in a form,
 * "—" where the value sits in a table), so the caller supplies it.
 */
export function StoreSelectItems({ noneLabel }: { noneLabel?: string }) {
  const { data: stores } = useSuspenseQuery(listStoreOptionsQueryOptions());

  return (
    <>
      {noneLabel !== undefined && <SelectItem value={SELECT_NONE}>{noneLabel}</SelectItem>}
      {stores.map((store) => (
        <SelectItem key={store.id} value={store.id.toString()}>
          {store.name}
        </SelectItem>
      ))}
    </>
  );
}
