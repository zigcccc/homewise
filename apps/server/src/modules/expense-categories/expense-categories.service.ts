import { and, asc, count, desc, eq, ilike, inArray, ne, sql } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { type Executor, type Filters, isUniqueViolation, writesAnything } from '#db/utils';
import { alreadyExists, couldNotResolve, notFound, somethingWentWrong } from '#lib/errors';

import {
  type CreateExpenseCategory,
  type ListExpenseCategoriesQueryParams,
  type PatchExpenseCategory,
} from './expense-categories.model';

/**
 * The labels a household files its spending under. Fully collaborative — whoever is logging an
 * expense can name the category it belongs in, the same way they can name a shop.
 */
export class ExpenseCategoriesService {
  /** Resolves a category, scoped to its household so ids from elsewhere 404. */
  private static async readCategoryRow(householdId: number, categoryId: number) {
    const [category] = await db
      .select()
      .from(schema.expenseCategory)
      .where(and(eq(schema.expenseCategory.householdId, householdId), eq(schema.expenseCategory.id, categoryId)))
      .limit(1);

    if (!category) {
      throw notFound('Category');
    }

    return category;
  }

  /**
   * How many expenses are filed under each of the given categories. Constrained to the ids just read
   * rather than grouping the whole table.
   */
  private static async countExpenseUsage(householdId: number, categoryIds: number[]) {
    if (categoryIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await db
      .select({ categoryId: schema.expense.categoryId, count: count() })
      .from(schema.expense)
      .where(and(eq(schema.expense.householdId, householdId), inArray(schema.expense.categoryId, categoryIds)))
      .groupBy(schema.expense.categoryId);

    return new Map(rows.map((row) => [row.categoryId!, row.count]));
  }

  /**
   * Rejects a name that already exists in the household, case-insensitively. The unique index is the
   * real guarantee — this exists so the user gets a 409 with a message instead of a constraint error.
   */
  private static async assertNameAvailable(householdId: number, name: string, excludeId?: number) {
    const filters: Filters = [
      eq(schema.expenseCategory.householdId, householdId),
      sql`lower(${schema.expenseCategory.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
      filters.push(ne(schema.expenseCategory.id, excludeId));
    }

    const [existing] = await db
      .select({ id: schema.expenseCategory.id })
      .from(schema.expenseCategory)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw alreadyExists(name, 'a category');
    }
  }

  /**
   * Confirms a category id belongs to this household, for the endpoints that accept one as a foreign
   * key. Returns the id so a caller can write it straight through; `null` passes as "uncategorised".
   */
  public static async assertInHousehold(householdId: number, categoryId: number | null | undefined) {
    if (categoryId === null || categoryId === undefined) {
      return categoryId;
    }

    await ExpenseCategoriesService.readCategoryRow(householdId, categoryId);

    return categoryId;
  }

  /**
   * Maps a category name onto a household row, creating it if it doesn't exist yet, and returns its
   * id. Matching is case-insensitive, so "Groceries" and "groceries" resolve to the same row.
   *
   * This is the find-or-create half of "a category named in the expense form isn't persisted until
   * the expense is saved": a name that collides with an existing category resolves to it rather than
   * 409ing, since the intent is "file this under Groceries", not "add a new category".
   *
   * Takes an `executor` because it runs inside the expense's own transaction — a category must not
   * outlive a write that then fails.
   */
  public static async resolveByName(executor: Executor, householdId: number, name: string) {
    const readMatching = async () =>
      executor
        .select({ id: schema.expenseCategory.id })
        .from(schema.expenseCategory)
        .where(
          and(
            eq(schema.expenseCategory.householdId, householdId),
            sql`lower(${schema.expenseCategory.name}) = lower(${name})`
          )
        )
        .limit(1);

    const [existing] = await readMatching();

    if (existing) {
      return existing.id;
    }

    // onConflictDoNothing covers a concurrent write creating the same name; the re-read picks it up.
    await executor.insert(schema.expenseCategory).values({ householdId, name }).onConflictDoNothing();

    const [resolved] = await readMatching();

    if (!resolved) {
      throw couldNotResolve(`category "${name}"`);
    }

    return resolved.id;
  }

  /** The household's categories, with how many expenses are filed under each. */
  public static async list(householdId: number, { search, sortKey, sortDirection }: ListExpenseCategoriesQueryParams) {
    const sortColumn = schema.expenseCategory[sortKey];

    const filters: Filters = [eq(schema.expenseCategory.householdId, householdId)];

    if (search) {
      filters.push(ilike(schema.expenseCategory.name, `%${search}%`));
    }

    const categories = await db
      .select()
      .from(schema.expenseCategory)
      .where(and(...filters))
      .orderBy(sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn));

    const usage = await ExpenseCategoriesService.countExpenseUsage(
      householdId,
      categories.map((row) => row.id)
    );

    return categories.map((row) => ({ ...row, expenseCount: usage.get(row.id) ?? 0 }));
  }

  public static async create(householdId: number, data: CreateExpenseCategory) {
    await ExpenseCategoriesService.assertNameAvailable(householdId, data.name);

    // The check above is a TOCTOU window: two concurrent creates of the same name both pass it, and
    // the loser hits the unique index. Translate that into the same 409 rather than a 500.
    const [created] = await db
      .insert(schema.expenseCategory)
      .values({ householdId, name: data.name })
      .returning()
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a category');
        }
        throw error;
      });

    if (!created) {
      throw somethingWentWrong();
    }

    return { ...created, expenseCount: 0 };
  }

  public static async patch(householdId: number, categoryId: number, data: PatchExpenseCategory) {
    const current = await ExpenseCategoriesService.readCategoryRow(householdId, categoryId);

    if (data.name !== undefined) {
      await ExpenseCategoriesService.assertNameAvailable(householdId, data.name, categoryId);
    }

    if (!writesAnything(data)) {
      const usage = await ExpenseCategoriesService.countExpenseUsage(householdId, [categoryId]);

      return { ...current, expenseCount: usage.get(categoryId) ?? 0 };
    }

    const [updated] = await db
      .update(schema.expenseCategory)
      .set({ name: data.name })
      .where(and(eq(schema.expenseCategory.householdId, householdId), eq(schema.expenseCategory.id, categoryId)))
      .returning()
      .catch((error: unknown) => {
        if (data.name !== undefined && isUniqueViolation(error)) {
          throw alreadyExists(data.name, 'a category');
        }
        throw error;
      });

    if (!updated) {
      throw notFound('Category');
    }

    const usage = await ExpenseCategoriesService.countExpenseUsage(householdId, [categoryId]);

    return { ...updated, expenseCount: usage.get(categoryId) ?? 0 };
  }

  /**
   * Hard delete, never blocked by usage: the expenses filed here just become uncategorised, which is
   * where every expense starts anyway.
   *
   * No transaction, unlike the shops this otherwise mirrors. That one opens one to copy the shop's
   * name onto shopping-list sections, whose check constraint would fail the delete otherwise. An
   * expense carries its own title and needs nothing tombstoned onto it.
   */
  public static async delete(householdId: number, categoryId: number) {
    const [deleted] = await db
      .delete(schema.expenseCategory)
      .where(and(eq(schema.expenseCategory.householdId, householdId), eq(schema.expenseCategory.id, categoryId)))
      .returning();

    if (!deleted) {
      throw notFound('Category');
    }

    return deleted;
  }
}
