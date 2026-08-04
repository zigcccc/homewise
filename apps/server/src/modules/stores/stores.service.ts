import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';

import { db, schema } from '@/db';
import { type Executor, emptyToNull, type Filters, isUniqueViolation, writesAnything } from '@/db/utils';
import { alreadyExists, couldNotResolve, notFound, somethingWentWrong } from '@/lib/errors';
import { ShoppingListsService } from '@/modules/shopping-lists/shopping-lists.service';

import { type CreateStore, type ListStoresQueryParams, type PatchStore } from './models';

/**
 * The shops a household buys at. An ingredient points at one, and a shopping list files that
 * ingredient under the matching section — so this is the vocabulary that makes a list read as one
 * trip per shop rather than one undifferentiated pile.
 */
export class StoresService {
  /** Resolves a store, scoped to its household so ids from elsewhere 404. */
  private static async readStoreRow(householdId: number, storeId: number) {
    const [store] = await db
      .select()
      .from(schema.store)
      .where(and(eq(schema.store.householdId, householdId), eq(schema.store.id, storeId)))
      .limit(1);

    if (!store) {
      throw notFound('Shop');
    }

    return store;
  }

  /**
   * How many library ingredients default to each of the given shops. Constrained to the ids just
   * read rather than grouping the whole table.
   */
  private static async countIngredientUsage(householdId: number, storeIds: number[]) {
    if (storeIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await db
      .select({ storeId: schema.ingredient.storeId, count: count() })
      .from(schema.ingredient)
      .where(and(eq(schema.ingredient.householdId, householdId), inArray(schema.ingredient.storeId, storeIds)))
      .groupBy(schema.ingredient.storeId);

    return new Map(rows.map((row) => [row.storeId!, row.count]));
  }

  /**
   * Rejects a name that already exists in the household, case-insensitively. The unique index is the
   * real guarantee — this exists so the user gets a 409 with a message instead of a constraint error.
   */
  private static async assertNameAvailable(householdId: number, name: string, excludeId?: number) {
    const filters: Filters = [
      eq(schema.store.householdId, householdId),
      sql`lower(${schema.store.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
      filters.push(ne(schema.store.id, excludeId));
    }

    const [existing] = await db
      .select({ id: schema.store.id })
      .from(schema.store)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw alreadyExists(name, 'a shop');
    }
  }

  /**
   * Confirms a store id belongs to this household, for the endpoints that accept one as a foreign
   * key. Returns the id so a caller can write it straight through; `null` passes as "no shop".
   */
  public static async assertInHousehold(householdId: number, storeId: number | null | undefined) {
    if (storeId === null || storeId === undefined) {
      return storeId;
    }

    await StoresService.readStoreRow(householdId, storeId);

    return storeId;
  }

  /**
   * Maps a shop name onto a household row, creating it if it doesn't exist yet, and returns its id.
   * Matching is case-insensitive, so "Spar" and "spar" resolve to the same row.
   *
   * This is the find-or-create half of "a shop named in the ingredient form isn't persisted until
   * the ingredient is saved": a name that collides with an existing shop resolves to it rather than
   * 409ing, since the intent is "file this under Spar", not "add a new shop".
   *
   * Takes an `executor` because it runs inside the ingredient's own transaction — a shop must not
   * outlive a write that then fails on a duplicate ingredient name.
   */
  public static async resolveByName(executor: Executor, householdId: number, name: string) {
    const readMatching = async () =>
      executor
        .select({ id: schema.store.id })
        .from(schema.store)
        .where(and(eq(schema.store.householdId, householdId), sql`lower(${schema.store.name}) = lower(${name})`))
        .limit(1);

    const [existing] = await readMatching();

    if (existing) {
      return existing.id;
    }

    // onConflictDoNothing covers a concurrent write creating the same name; the re-read picks it up.
    await executor.insert(schema.store).values({ householdId, name }).onConflictDoNothing();

    const [resolved] = await readMatching();

    if (!resolved) {
      throw couldNotResolve(`shop "${name}"`);
    }

    return resolved.id;
  }

  /** The household's shops, with how many ingredients default to each. */
  public static async list(householdId: number, { search, sortKey, sortDirection }: ListStoresQueryParams) {
    const { householdId: householdIdColumn, name, notes } = schema.store;
    const sortColumn = schema.store[sortKey];

    const filters: Filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(name, term), ilike(notes, term)));
    }

    const stores = await db
      .select()
      .from(schema.store)
      .where(and(...filters))
      .orderBy(sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn));

    const usage = await StoresService.countIngredientUsage(
      householdId,
      stores.map((row) => row.id)
    );

    return stores.map((row) => ({ ...row, ingredientCount: usage.get(row.id) ?? 0 }));
  }

  public static async create(householdId: number, data: CreateStore) {
    await StoresService.assertNameAvailable(householdId, data.name);

    // The check above is a TOCTOU window: two concurrent creates of the same name both pass it, and
    // the loser hits the unique index. Translate that into the same 409 rather than a 500.
    const [created] = await db
      .insert(schema.store)
      .values({ householdId, name: data.name, notes: emptyToNull(data.notes) })
      .returning()
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a shop');
        }
        throw error;
      });

    if (!created) {
      throw somethingWentWrong();
    }

    return { ...created, ingredientCount: 0 };
  }

  public static async patch(householdId: number, storeId: number, data: PatchStore) {
    await StoresService.readStoreRow(householdId, storeId);

    if (data.name !== undefined) {
      await StoresService.assertNameAvailable(householdId, data.name, storeId);
    }

    const set = { name: data.name, notes: emptyToNull(data.notes) };

    if (!writesAnything(set)) {
      const current = await StoresService.readStoreRow(householdId, storeId);
      const usage = await StoresService.countIngredientUsage(householdId, [storeId]);

      return { ...current, ingredientCount: usage.get(storeId) ?? 0 };
    }

    const [updated] = await db
      .update(schema.store)
      .set(set)
      .where(and(eq(schema.store.householdId, householdId), eq(schema.store.id, storeId)))
      .returning()
      .catch((error: unknown) => {
        if (data.name !== undefined && isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a shop');
        }
        throw error;
      });

    if (!updated) {
      throw notFound('Shop');
    }

    const usage = await StoresService.countIngredientUsage(householdId, [storeId]);

    return { ...updated, ingredientCount: usage.get(storeId) ?? 0 };
  }

  /**
   * Hard delete, never blocked by usage: the ingredients that pointed here just lose their default
   * (the FK is `set null`), which is a preference, not content worth protecting.
   *
   * Shopping-list sections are different — a heading with neither a shop nor a name violates their
   * check constraint — so the name is copied onto them first, inside the same transaction. Skip that
   * and the delete fails rather than silently leaving a hole, which is exactly what makes it
   * impossible to forget.
   */
  public static async delete(householdId: number, storeId: number) {
    const store = await StoresService.readStoreRow(householdId, storeId);

    const deleted = await db.transaction(async (tx) => {
      await ShoppingListsService.detachStore(tx, storeId, store.name);

      const [row] = await tx
        .delete(schema.store)
        .where(and(eq(schema.store.householdId, householdId), eq(schema.store.id, storeId)))
        .returning();

      return row;
    });

    if (!deleted) {
      throw notFound('Shop');
    }

    return deleted;
  }
}
