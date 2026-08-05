import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { clearableDate, optionalText, searchQueryParam, sortDirection } from '#lib/models';

const entryColumns = {
  childPhrase: (model: z.ZodString) =>
    model
      .trim()
      .min(1, { error: 'Child phrase must contain at least 1 character' })
      .max(128, { error: 'Child phrase must contain at most 128 characters' }),
  adultTranslation: (model: z.ZodString) =>
    model
      .trim()
      .min(1, { error: 'Translation must contain at least 1 character' })
      .max(256, { error: 'Translation must contain at most 256 characters' }),
};

/** Both are cleared with `''` by the form, which is not the column's NULL. */
const entryPayloadFields = { firstHeardOn: clearableDate.optional(), notes: optionalText(1000, 'Notes') };

/** An entry belongs to a dictionary, not to a household directly; `createdBy` comes off the session. */
const serverOwnedEntryColumns = {
  createdAt: true,
  createdBy: true,
  dictionaryId: true,
  id: true,
  updatedAt: true,
} as const;

export const createChildDictionaryEntryModel = createInsertSchema(schema.childDictionaryEntry, entryColumns)
  .omit({
    ...serverOwnedEntryColumns,
    // A new entry is never born archived — that's a later edit.
    archived: true,
  })
  .extend(entryPayloadFields);
export type CreateChildDictionaryEntry = z.infer<typeof createChildDictionaryEntryModel>;

export const patchChildDictionaryEntryModel = createUpdateSchema(schema.childDictionaryEntry, entryColumns)
  .omit(serverOwnedEntryColumns)
  .extend(entryPayloadFields);
export type PatchChildDictionaryEntry = z.infer<typeof patchChildDictionaryEntryModel>;

export const childDictionaryPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const childDictionaryEntryPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  entryId: z.coerce.number<number>().int().positive(),
});

export const childDictionaryEntrySortKey = z.enum(['childPhrase', 'adultTranslation', 'createdAt']);
export type ChildDictionaryEntrySortKey = z.infer<typeof childDictionaryEntrySortKey>;

export const listChildDictionaryEntriesQueryParamsModel = z.object({
  /** Matched across the child phrase and the adult translation. */
  search: searchQueryParam,
  sortKey: childDictionaryEntrySortKey.default('childPhrase').catch('childPhrase'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  includeArchived: z.stringbool().default(false).catch(false),
});
export type ListChildDictionaryEntriesQueryParams = z.infer<typeof listChildDictionaryEntriesQueryParamsModel>;
