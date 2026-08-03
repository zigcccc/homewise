import z from 'zod';

import { optionalText } from '@/lib/models';

const name = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(96, { error: 'Name must contain at most 96 characters' });

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const storeName = name(z.string());

const notes = optionalText(500, 'Notes');

export const createStoreModel = z.object({
  name: name(z.string()),
  notes,
});
export type CreateStore = z.infer<typeof createStoreModel>;

export const patchStoreModel = z.object({
  name: name(z.string()).optional(),
  notes,
});
export type PatchStore = z.infer<typeof patchStoreModel>;

export const storePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const storeSortKey = z.enum(['name', 'createdAt']);
export type StoreSortKey = z.infer<typeof storeSortKey>;

export const storeSortDirection = z.enum(['asc', 'desc']);
export type StoreSortDirection = z.infer<typeof storeSortDirection>;

export const listStoresQueryParamsModel = z.object({
  /** Case-insensitive substring match across the name and the notes. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .catch(undefined),
  sortKey: storeSortKey.default('name').catch('name'),
  sortDirection: storeSortDirection.default('asc').catch('asc'),
});
export type ListStoresQueryParams = z.infer<typeof listStoresQueryParamsModel>;
