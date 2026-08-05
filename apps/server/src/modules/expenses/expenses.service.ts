import { and, asc, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { type Executor, type Filters, writesAnything } from '#db/utils';
import { addDays, endOfMonth, startOfMonth, todayISO } from '#lib/dates';
import { notFound, somethingWentWrong } from '#lib/errors';
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
  /**
   * The window a read covers: the current month when none was given, clamped rather than refused when
   * the range is inverted or absurdly long. A malformed link should show a sane month, not a 400.
   */
  private static resolveRange({ from, to }: { from?: string; to?: string }) {
    const start = from ?? startOfMonth(todayISO());
    const latestEnd = addDays(start, MAX_EXPENSE_RANGE_DAYS - 1);
    const requestedEnd = to ?? endOfMonth(start);

    if (requestedEnd < start) {
      return { from: start, to: start };
    }

    return { from: start, to: requestedEnd > latestEnd ? latestEnd : requestedEnd };
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
      where: (fields, { and: andWhere, eq: eqWhere }) =>
        andWhere(eqWhere(fields.householdId, householdId), eqWhere(fields.id, expenseId)),
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

    const expenses = await db.query.expense.findMany({
      where: and(...filters),
      // `id` breaks the tie, so two expenses on the same day can't swap places between reads and
      // move an open inline editor onto a different row.
      orderBy: [direction(sortColumn), direction(schema.expense.id)],
      with: { category: { columns: { id: true, name: true } } },
    });

    // The effective window comes back too: it may have been defaulted or clamped, and the header
    // names the month it is actually showing.
    return { from, to, expenses };
  }

  /**
   * What the window cost, and where it went. Deliberately unfiltered by search or category — this
   * describes the whole month, so the breakdown still lists every category while one is selected.
   */
  public static async summary(householdId: number, params: ExpensesSummaryQueryParams) {
    const { from, to } = ExpensesService.resolveRange(params);
    const where = and(...ExpensesService.rangeFilters(householdId, from, to));

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
        .where(where)
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
        .where(where)
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
      // Zero slices are kept. A category whose every expense was paid back still sums to nothing,
      // but the expenses are right there in the table — dropping the slice would take the only way
      // of filtering to them with it. Categories with no expenses at all aren't in the GROUP BY.
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
      return ExpensesService.readExpenseWithRelations(householdId, expenseId);
    }

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.expense)
        .set({
          title: data.title,
          amount: data.amount,
          recordedAt: data.recordedAt,
          categoryId: await ExpensesService.resolveCategoryId(tx, householdId, data),
          // Re-marking an already-returned expense keeps the original moment rather than moving it.
          paidBackAt:
            data.paidBack === undefined ? undefined : data.paidBack ? (existing.paidBackAt ?? new Date()) : null,
        })
        .where(and(eq(schema.expense.householdId, householdId), eq(schema.expense.id, expenseId)))
        .returning({ id: schema.expense.id });

      if (!updated) {
        throw notFound('Expense');
      }
    });

    return ExpensesService.readExpenseWithRelations(householdId, expenseId);
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
