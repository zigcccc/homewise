import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, optionalText, pagedQueryParams, searchQueryParam, sortDirection } from '#lib/models';

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const storeName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

const notes = { notes: optionalText(500, 'Notes') };

export const createStoreModel = createInsertSchema(schema.store, { name: () => storeName })
  .omit(dbOwnedColumns)
  .extend(notes);
export type CreateStore = z.infer<typeof createStoreModel>;

export const patchStoreModel = createUpdateSchema(schema.store, { name: () => storeName })
  .omit(dbOwnedColumns)
  .extend(notes);
export type PatchStore = z.infer<typeof patchStoreModel>;

export const storePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const storeSortKey = z.enum(['name', 'createdAt']);
export type StoreSortKey = z.infer<typeof storeSortKey>;

export const listStoresQueryParamsModel = z.object({
  /** Matched against the name and the notes both. */
  search: searchQueryParam,
  sortKey: storeSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams().shape,
});
export type ListStoresQueryParams = z.infer<typeof listStoresQueryParamsModel>;
