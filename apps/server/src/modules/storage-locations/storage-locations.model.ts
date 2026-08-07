import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, optionalText, searchQueryParam, sortDirection } from '#lib/models';

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const storageLocationName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

/**
 * The map pin, as two halves. Both are optional and `null` clears them.
 *
 * Only the ranges are checked here. "Both or neither" can't be: a PATCH may legitimately carry one
 * half, and whether that leaves a valid pin depends on what is already stored — so the service
 * decides it against the merged row.
 */
const pin = {
  latitude: z
    .number()
    .min(-90, { error: 'Latitude must be between -90 and 90' })
    .max(90, { error: 'Latitude must be between -90 and 90' })
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, { error: 'Longitude must be between -180 and 180' })
    .max(180, { error: 'Longitude must be between -180 and 180' })
    .nullable()
    .optional(),
};

const details = { address: optionalText(256, 'Address'), ...pin };

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
