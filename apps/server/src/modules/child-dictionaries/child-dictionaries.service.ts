import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import {
  type CreateChildDictionaryEntry,
  type ListChildDictionaryEntriesQueryParams,
  type PatchChildDictionaryEntry,
} from './models';

/** The `creator` join: the user account that added an entry. Null once that account is deleted. */
const creatorWith = { columns: { id: true, name: true, image: true } } as const;

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

export class ChildDictionariesService {
  /** Existence + household-scoping check, without the joins the full detail response needs. */
  private static async readDictionaryRow(householdId: number, dictionaryId: number) {
    const dictionary = await db.query.childDictionary.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, dictionaryId)),
    });

    if (!dictionary) {
      throw new HTTPException(404, { message: 'Dictionary not found' });
    }

    return dictionary;
  }

  public static async listEntries(
    householdId: number,
    dictionaryId: number,
    { search, sortKey, sortDirection, includeArchived }: ListChildDictionaryEntriesQueryParams
  ) {
    // Resolves through the household, so a dictionary id from elsewhere 404s before we read entries.
    await ChildDictionariesService.readDictionaryRow(householdId, dictionaryId);

    const { childPhrase, adultTranslation, archived, dictionaryId: dictionaryIdColumn } = schema.childDictionaryEntry;
    const sortColumn = schema.childDictionaryEntry[sortKey];

    const filters = [eq(dictionaryIdColumn, dictionaryId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(childPhrase, term), ilike(adultTranslation, term))!);
    }

    if (!includeArchived) {
      filters.push(eq(archived, false));
    }

    return await db.query.childDictionaryEntry.findMany({
      where: and(...filters),
      orderBy: sortDirection === 'desc' ? [desc(sortColumn)] : [asc(sortColumn)],
      with: { creator: creatorWith },
    });
  }

  /** Re-reads an entry with its `creator` joined, so mutations return the same shape as `read`. */
  private static async readEntryWithCreator(dictionaryId: number, entryId: number) {
    const entry = await db.query.childDictionaryEntry.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.dictionaryId, dictionaryId), eq(fields.id, entryId)),
      with: { creator: creatorWith },
    });

    if (!entry) {
      throw new HTTPException(404, { message: 'Entry not found' });
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
      throw new HTTPException(404, { message: 'Entry not found' });
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
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return ChildDictionariesService.readEntryWithCreator(dictionaryId, created.id);
  }

  public static async patchEntry(
    householdId: number,
    dictionaryId: number,
    entryId: number,
    data: PatchChildDictionaryEntry
  ) {
    await ChildDictionariesService.readEntry(householdId, dictionaryId, entryId);

    const [updated] = await db
      .update(schema.childDictionaryEntry)
      .set({
        ...data,
        notes: emptyToNull(data.notes),
        firstHeardOn: emptyToNull(data.firstHeardOn),
      })
      .where(
        and(eq(schema.childDictionaryEntry.dictionaryId, dictionaryId), eq(schema.childDictionaryEntry.id, entryId))
      )
      .returning();

    if (!updated) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return ChildDictionariesService.readEntryWithCreator(dictionaryId, updated.id);
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
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return deleted;
  }
}
