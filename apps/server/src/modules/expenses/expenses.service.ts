import { and, asc, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { changedColumns, type Executor, type Filters, readPagedList, writesAnything } from '#db/utils';
import { clampRange, endOfMonth, startOfMonth, todayISO } from '#lib/dates';
import { notFound, somethingWentWrong } from '#lib/errors';
import { type FieldChange } from '#lib/models';
import { ExpenseCategoriesService } from '#modules/expense-categories/expense-categories.service';
import { HouseholdsService } from '#modules/households/households.service';

import {
  type CreateExpense,
  type ExpensesSummaryQueryParams,
  type ListExpensesQueryParams,
  MAX_EXPENSE_RANGE_DAYS,
  type PatchExpense,
} from './expenses.model';

/**
 * What the household has spent. A month is not a row here — it is just the expenses whose
 * `recordedAt` falls inside it — so every read is a date range, and the client decides which range a
 * month is.
 *
 * Nothing in this file adds money up in JavaScript. `numeric` is exact in Postgres and a double is
 * not, so the totals are `sum()` aggregates read back through `::text` and parsed once.
 */
export class ExpensesService {
  /** The window a read covers, defaulting to the whole of the current month. */
  private static resolveRange({ from, to }: { from?: string; to?: string }) {
    const start = from ?? startOfMonth(todayISO());

    return clampRange(start, to ?? endOfMonth(start), MAX_EXPENSE_RANGE_DAYS);
  }

  /** Resolves an expense, scoped to its household so ids from elsewhere 404. */
  private static async readExpenseRow(householdId: number, expenseId: number) {
    const [expense] = await db
      .select()
      .from(schema.expense)
      .where(and(eq(schema.expense.householdId, householdId), eq(schema.expense.id, expenseId)))
      .limit(1);

    if (!expense) {
      throw notFound('Expense');
    }

    return expense;
  }

  /**
   * An expense in the shape the list endpoint returns it — joined category. Every mutation reads back
   * through here so a created or patched row is the same type as a refetched one, which is what lets
   * the web swap a PATCH result straight into its cached list.
   */
  private static async readExpenseWithRelations(householdId: number, expenseId: number) {
    const expense = await db.query.expense.findFirst({
      where: and(eq(schema.expense.householdId, householdId), eq(schema.expense.id, expenseId)),
      with: { category: { columns: { id: true, name: true } } },
    });

    if (!expense) {
      throw notFound('Expense');
    }

    return expense;
  }

  /**
   * Which category an incoming payload means. A name is found-or-created inside the caller's
   * transaction; an id is a client-supplied foreign key, so it's checked rather than trusted — one
   * from another household would otherwise be writable here.
   */
  private static async resolveCategoryId(
    executor: Executor,
    householdId: number,
    data: { categoryId?: number | null; categoryName?: string }
  ) {
    if (data.categoryName !== undefined) {
      return ExpenseCategoriesService.resolveByName(executor, householdId, data.categoryName);
    }

    return ExpenseCategoriesService.assertInHousehold(householdId, data.categoryId);
  }

  /** The filters shared by the list and its summary, minus the ones only the list applies. */
  private static rangeFilters(householdId: number, from: string, to: string): Filters {
    return [
      eq(schema.expense.householdId, householdId),
      gte(schema.expense.recordedAt, from),
      lte(schema.expense.recordedAt, to),
    ];
  }

  public static async list(householdId: number, params: ListExpensesQueryParams) {
    const { from, to } = ExpensesService.resolveRange(params);
    const filters = ExpensesService.rangeFilters(householdId, from, to);

    if (params.search) {
      filters.push(ilike(schema.expense.title, `%${params.search}%`));
    }

    if (params.category === 'none') {
      filters.push(isNull(schema.expense.categoryId));
    } else if (params.category !== undefined) {
      filters.push(eq(schema.expense.categoryId, params.category));
    }

    const sortColumn = schema.expense[params.sortKey];
    const direction = params.sortDirection === 'desc' ? desc : asc;

    const paged = await readPagedList({
      filters,
      page: params.page,
      pageSize: params.pageSize,
      table: schema.expense,
      read: (query) =>
        db.query.expense.findMany({
          ...query,
          // `id` breaks the tie, so two expenses on the same day can't swap places between reads and
          // move an open inline editor onto a different row — or across a page boundary.
          orderBy: [direction(sortColumn), direction(schema.expense.id)],
          with: { category: { columns: { id: true, name: true } } },
        }),
    });

    // The effective window comes back too: it may have been defaulted or clamped, and the header
    // names the month it is actually showing.
    return { ...paged, from, to };
  }

  /**
   * What the window cost, and where it went. Deliberately unfiltered by search or category — this
   * describes the whole month, so the breakdown still lists every category while one is selected.
   */
  public static async summary(householdId: number, params: ExpensesSummaryQueryParams) {
    const { from, to } = ExpensesService.resolveRange(params);
    const inWindow = and(...ExpensesService.rangeFilters(householdId, from, to));

    // Two spellings of one aggregate, and the difference matters: the `::text` one is what crosses
    // the wire (a `numeric` is exact in Postgres and a double is not), but ordering by it would sort
    // the breakdown lexicographically and file 6.00 above 14.70. Sort by the number, send the text.
    const spentSum = sql`coalesce(sum(${schema.expense.amount}) filter (where ${schema.expense.paidBackAt} is null), 0)`;
    const spent = sql<string>`${spentSum}::text`;

    const [totals, byCategory] = await Promise.all([
      db
        .select({
          currency: schema.expense.currency,
          spent,
          paidBack: sql<string>`coalesce(sum(${schema.expense.amount}) filter (where ${schema.expense.paidBackAt} is not null), 0)::text`,
        })
        .from(schema.expense)
        .where(inWindow)
        .groupBy(schema.expense.currency),
      db
        .select({
          categoryId: schema.expense.categoryId,
          categoryName: schema.expenseCategory.name,
          currency: schema.expense.currency,
          amount: spent,
        })
        .from(schema.expense)
        .leftJoin(schema.expenseCategory, eq(schema.expense.categoryId, schema.expenseCategory.id))
        .where(inWindow)
        .groupBy(schema.expense.categoryId, schema.expenseCategory.name, schema.expense.currency)
        .orderBy(desc(spentSum)),
    ]);

    return {
      from,
      to,
      totals: totals.map((row) => ({
        currency: row.currency,
        spent: Number(row.spent),
        paidBack: Number(row.paidBack),
      })),
      byCategory: byCategory.map((row) => ({ ...row, amount: Number(row.amount) })),
    };
  }

  public static async create(householdId: number, data: CreateExpense) {
    // Copied onto the row rather than joined, so changing the setting later can't restate this month.
    const currency = await HouseholdsService.readCurrency(householdId);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.expense)
        .values({
          householdId,
          title: data.title,
          amount: data.amount,
          currency,
          recordedAt: data.recordedAt,
          categoryId: (await ExpensesService.resolveCategoryId(tx, householdId, data)) ?? null,
        })
        .returning({ id: schema.expense.id });

      if (!row) {
        throw somethingWentWrong();
      }

      return row;
    });

    return ExpensesService.readExpenseWithRelations(householdId, created.id);
  }

  public static async patch(householdId: number, expenseId: number, data: PatchExpense) {
    const existing = await ExpensesService.readExpenseRow(householdId, expenseId);

    // Decided before the category is resolved, so `PATCH {}` can't mint one on its way to doing
    // nothing.
    if (!writesAnything(data)) {
      return { data: await ExpensesService.readExpenseWithRelations(householdId, expenseId), changeset: [] };
    }

    // Filled inside the transaction: the category is only resolved (or minted) there.
    let changeset: FieldChange[] = [];

    await db.transaction(async (tx) => {
      const set = {
        title: data.title,
        amount: data.amount,
        recordedAt: data.recordedAt,
        categoryId: await ExpensesService.resolveCategoryId(tx, householdId, data),
        // Re-marking an already-returned expense keeps the original moment rather than moving it.
        paidBackAt:
          data.paidBack === undefined ? undefined : data.paidBack ? (existing.paidBackAt ?? new Date()) : null,
      };

      changeset = changedColumns(existing, set);

      const [updated] = await tx
        .update(schema.expense)
        .set(set)
        .where(and(eq(schema.expense.householdId, householdId), eq(schema.expense.id, expenseId)))
        .returning({ id: schema.expense.id });

      if (!updated) {
        throw notFound('Expense');
      }
    });

    return { data: await ExpensesService.readExpenseWithRelations(householdId, expenseId), changeset };
  }

  /** Hard delete. An expense holds nothing of its own, and a mistyped one is just a mistake. */
  public static async delete(householdId: number, expenseId: number) {
    const [deleted] = await db
      .delete(schema.expense)
      .where(and(eq(schema.expense.householdId, householdId), eq(schema.expense.id, expenseId)))
      .returning();

    if (!deleted) {
      throw notFound('Expense');
    }

    return deleted;
  }
}
