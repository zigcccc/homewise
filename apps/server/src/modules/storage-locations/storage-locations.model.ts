import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { coordinates, dbOwnedColumns, optionalText, searchQueryParam, sortDirection } from '#lib/models';

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const storageLocationName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

const details = { address: optionalText(256, 'Address'), ...coordinates };

export const createStorageLocationModel = createInsertSchema(schema.storageLocation, {
  name: () => storageLocationName,
})
  .omit(dbOwnedColumns)
  .extend(details);
export type CreateStorageLocation = z.infer<typeof createStorageLocationModel>;

export const patchStorageLocationModel = createUpdateSchema(schema.storageLocation, {
  name: () => storageLocationName,
})
  .omit(dbOwnedColumns)
  .extend(details);
export type PatchStorageLocation = z.infer<typeof patchStorageLocationModel>;

export const storageLocationPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const storageLocationSortKey = z.enum(['name', 'createdAt']);
export type StorageLocationSortKey = z.infer<typeof storageLocationSortKey>;

export const listStorageLocationsQueryParamsModel = z.object({
  /** Matched against the name and the address both. */
  search: searchQueryParam,
  sortKey: storageLocationSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});
export type ListStorageLocationsQueryParams = z.infer<typeof listStorageLocationsQueryParamsModel>;
