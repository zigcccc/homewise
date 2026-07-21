import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { HouseholdsService } from '../households/households.service';
import {
  type CreateChildDictionary,
  type CreateChildDictionaryEntry,
  type ListChildDictionaryEntriesQueryParams,
  type PatchChildDictionaryEntry,
} from './models';

/** The `child` join: a household member, shaped like the households module returns them. */
const childWith = {
  columns: { id: true, name: true, nickname: true, role: true, userId: true },
  with: { user: { columns: { id: true, email: true, name: true } } },
} as const;

/** The `creator` join: the user account that added an entry. Null once that account is deleted. */
const creatorWith = { columns: { id: true, name: true, image: true } } as const;

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

export class ChildDictionariesService {
  /**
   * Flattens the joined child into the same shape the households module returns everywhere else, so
   * `displayName` resolution stays in one place.
   */
  private static toResponse<D extends { child: Parameters<typeof HouseholdsService.toMemberResponse>[0] }>(
    dictionary: D,
    ownerId: string
  ) {
    const { child, ...rest } = dictionary;
    return { ...rest, child: HouseholdsService.toMemberResponse(child, ownerId) };
  }

  public static async list(householdId: number, ownerId: string) {
    const dictionaries = await db.query.childDictionary.findMany({
      where: (fields, { eq }) => eq(fields.householdId, householdId),
      orderBy: (fields, { asc }) => [asc(fields.createdAt)],
      with: { child: childWith },
    });

    // Scoped to the dictionaries we just read — without this the group-by scans every entry row in
    // the table, across all households.
    const dictionaryIds = dictionaries.map((dictionary) => dictionary.id);

    const entryCounts = dictionaryIds.length
      ? await db
          .select({ dictionaryId: schema.childDictionaryEntry.dictionaryId, count: count() })
          .from(schema.childDictionaryEntry)
          .where(inArray(schema.childDictionaryEntry.dictionaryId, dictionaryIds))
          .groupBy(schema.childDictionaryEntry.dictionaryId)
      : [];

    const countByDictionary = new Map(entryCounts.map(({ dictionaryId, count }) => [dictionaryId, count]));

    return dictionaries.map((dictionary) => ({
      ...ChildDictionariesService.toResponse(dictionary, ownerId),
      entryCount: countByDictionary.get(dictionary.id) ?? 0,
    }));
  }

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

  /** Entries themselves are served by {@link listEntries}; the detail response only carries the count. */
  public static async read(householdId: number, dictionaryId: number, ownerId: string) {
    const dictionary = await db.query.childDictionary.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, dictionaryId)),
      with: { child: childWith },
    });

    if (!dictionary) {
      throw new HTTPException(404, { message: 'Dictionary not found' });
    }

    const [entryCount] = await db
      .select({ count: count() })
      .from(schema.childDictionaryEntry)
      .where(eq(schema.childDictionaryEntry.dictionaryId, dictionaryId));

    return { ...ChildDictionariesService.toResponse(dictionary, ownerId), entryCount: entryCount?.count ?? 0 };
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

  public static async create(householdId: number, data: CreateChildDictionary, ownerId: string) {
    // Throws 404 when the member belongs to a different household.
    const member = await HouseholdsService.readHouseholdMember(householdId, data.memberId);

    if (member.role !== 'child') {
      throw new HTTPException(400, { message: 'Only members with the "child" role can have a dictionary.' });
    }

    const existing = await db.query.childDictionary.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.memberId, member.id)),
    });

    if (existing) {
      throw new HTTPException(409, { message: 'This child already has a dictionary.' });
    }

    const [created] = await db.insert(schema.childDictionary).values({ householdId, memberId: member.id }).returning();

    if (!created) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return ChildDictionariesService.read(householdId, created.id, ownerId);
  }

  public static async delete(householdId: number, dictionaryId: number) {
    const [deleted] = await db
      .delete(schema.childDictionary)
      .where(and(eq(schema.childDictionary.householdId, householdId), eq(schema.childDictionary.id, dictionaryId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Dictionary not found' });
    }

    return deleted;
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
