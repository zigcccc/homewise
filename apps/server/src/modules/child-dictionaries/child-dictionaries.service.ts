import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { changedColumns, emptyToNull, type Filters, readPagedList } from '#db/utils';
import { notFound, somethingWentWrong } from '#lib/errors';

import {
  type CreateChildDictionaryEntry,
  type ListChildDictionaryEntriesQueryParams,
  type PatchChildDictionaryEntry,
} from './child-dictionaries.model';

/** The `creator` join: the user account that added an entry. Null once that account is deleted. */
const creatorWith = { columns: { id: true, name: true, image: true } } as const;

export class ChildDictionariesService {
  /** Existence + household-scoping check, without the joins the full detail response needs. */
  private static async readDictionaryRow(householdId: number, dictionaryId: number) {
    const dictionary = await db.query.childDictionary.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, dictionaryId)),
    });

    if (!dictionary) {
      throw notFound('Dictionary');
    }

    return dictionary;
  }

  public static async listEntries(
    householdId: number,
    dictionaryId: number,
    { search, sortKey, sortDirection, includeArchived, page, pageSize }: ListChildDictionaryEntriesQueryParams
  ) {
    // Resolves through the household, so a dictionary id from elsewhere 404s before we read entries.
    await ChildDictionariesService.readDictionaryRow(householdId, dictionaryId);

    const { childPhrase, adultTranslation, archived, dictionaryId: dictionaryIdColumn } = schema.childDictionaryEntry;
    const sortColumn = schema.childDictionaryEntry[sortKey];

    const filters: Filters = [eq(dictionaryIdColumn, dictionaryId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(childPhrase, term), ilike(adultTranslation, term)));
    }

    if (!includeArchived) {
      filters.push(eq(archived, false));
    }

    const { id } = schema.childDictionaryEntry;

    return await readPagedList({
      filters,
      page,
      pageSize,
      table: schema.childDictionaryEntry,
      read: (query) =>
        db.query.childDictionaryEntry.findMany({
          ...query,
          orderBy: sortDirection === 'desc' ? [desc(sortColumn), desc(id)] : [asc(sortColumn), asc(id)],
          with: { creator: creatorWith },
        }),
    });
  }

  /** Re-reads an entry with its `creator` joined, so mutations return the same shape as `read`. */
  private static async readEntryWithCreator(dictionaryId: number, entryId: number) {
    const entry = await db.query.childDictionaryEntry.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.dictionaryId, dictionaryId), eq(fields.id, entryId)),
      with: { creator: creatorWith },
    });

    if (!entry) {
      throw notFound('Entry');
    }

    return entry;
  }

  /** Resolves an entry, scoped through its dictionary so ids from other households can't be reached. */
  private static async readEntry(householdId: number, dictionaryId: number, entryId: number) {
    const entry = await db.query.childDictionaryEntry.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.dictionaryId, dictionaryId), eq(fields.id, entryId)),
      with: { dictionary: { columns: { householdId: true } } },
    });

    if (!entry || entry.dictionary.householdId !== householdId) {
      throw notFound('Entry');
    }

    return entry;
  }

  public static async createEntry(
    householdId: number,
    dictionaryId: number,
    data: CreateChildDictionaryEntry,
    userId: string
  ) {
    await ChildDictionariesService.readDictionaryRow(householdId, dictionaryId);

    const [created] = await db
      .insert(schema.childDictionaryEntry)
      .values({
        dictionaryId,
        childPhrase: data.childPhrase,
        adultTranslation: data.adultTranslation,
        notes: emptyToNull(data.notes),
        firstHeardOn: emptyToNull(data.firstHeardOn),
        createdBy: userId,
      })
      .returning();

    if (!created) {
      throw somethingWentWrong();
    }

    return ChildDictionariesService.readEntryWithCreator(dictionaryId, created.id);
  }

  public static async patchEntry(
    householdId: number,
    dictionaryId: number,
    entryId: number,
    data: PatchChildDictionaryEntry
  ) {
    const existing = await ChildDictionariesService.readEntry(householdId, dictionaryId, entryId);
    const set = { ...data, notes: emptyToNull(data.notes), firstHeardOn: emptyToNull(data.firstHeardOn) };

    const [updated] = await db
      .update(schema.childDictionaryEntry)
      .set(set)
      .where(
        and(eq(schema.childDictionaryEntry.dictionaryId, dictionaryId), eq(schema.childDictionaryEntry.id, entryId))
      )
      .returning();

    if (!updated) {
      throw somethingWentWrong();
    }

    return {
      data: await ChildDictionariesService.readEntryWithCreator(dictionaryId, updated.id),
      changeset: changedColumns(existing, set),
    };
  }

  public static async deleteEntry(householdId: number, dictionaryId: number, entryId: number) {
    await ChildDictionariesService.readEntry(householdId, dictionaryId, entryId);

    const [deleted] = await db
      .delete(schema.childDictionaryEntry)
      .where(
        and(eq(schema.childDictionaryEntry.dictionaryId, dictionaryId), eq(schema.childDictionaryEntry.id, entryId))
      )
      .returning();

    if (!deleted) {
      throw somethingWentWrong();
    }

    return deleted;
  }
}
