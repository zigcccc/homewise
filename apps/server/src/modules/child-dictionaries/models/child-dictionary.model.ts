import z from 'zod';

const childPhrase = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Child phrase must contain at least 1 character' })
    .max(128, { error: 'Child phrase must contain at most 128 characters' });

const adultTranslation = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Translation must contain at least 1 character' })
    .max(256, { error: 'Translation must contain at most 256 characters' });

const notes = (model: z.ZodString) => model.trim().max(1000, { error: 'Notes must contain at most 1000 characters' });

/** `YYYY-MM-DD`, matching the `date` column. Empty string clears the value. */
const firstHeardOn = z.iso.date({ error: 'Use a valid date' }).or(z.literal('')).optional();

export const createChildDictionaryModel = z.object({
  memberId: z.coerce.number<number>().int().positive(),
});
export type CreateChildDictionary = z.infer<typeof createChildDictionaryModel>;

export const createChildDictionaryEntryModel = z.object({
  childPhrase: childPhrase(z.string()),
  adultTranslation: adultTranslation(z.string()),
  notes: notes(z.string()).optional(),
  firstHeardOn,
});
export type CreateChildDictionaryEntry = z.infer<typeof createChildDictionaryEntryModel>;

export const patchChildDictionaryEntryModel = z.object({
  childPhrase: childPhrase(z.string()).optional(),
  adultTranslation: adultTranslation(z.string()).optional(),
  notes: notes(z.string()).optional(),
  firstHeardOn,
  archived: z.boolean().optional(),
});
export type PatchChildDictionaryEntry = z.infer<typeof patchChildDictionaryEntryModel>;

export const childDictionaryPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const childDictionaryEntryPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  entryId: z.coerce.number<number>().int().positive(),
});

export const childDictionaryEntrySortKey = z.enum(['childPhrase', 'adultTranslation', 'createdAt']);
export type ChildDictionaryEntrySortKey = z.infer<typeof childDictionaryEntrySortKey>;

export const childDictionaryEntrySortDirection = z.enum(['asc', 'desc']);
export type ChildDictionaryEntrySortDirection = z.infer<typeof childDictionaryEntrySortDirection>;

export const listChildDictionaryEntriesQueryParamsModel = z.object({
  /** Case-insensitive substring match across the child phrase and the adult translation. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  sortKey: childDictionaryEntrySortKey.default('childPhrase').catch('childPhrase'),
  sortDirection: childDictionaryEntrySortDirection.default('asc').catch('asc'),
  includeArchived: z.stringbool().default(false).catch(false),
});
export type ListChildDictionaryEntriesQueryParams = z.infer<typeof listChildDictionaryEntriesQueryParamsModel>;
