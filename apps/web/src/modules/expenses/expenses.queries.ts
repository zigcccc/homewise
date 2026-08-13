import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listExpenses = client.expenses.$get;
const $expensesSummary = client.expenses.summary.$get;
const $createExpense = client.expenses.$post;
const $patchExpense = client.expenses[':id'].$patch;
const $deleteExpense = client.expenses[':id'].$delete;

export type ListExpensesQuery = InferRequestType<typeof $listExpenses>['query'];
export type ExpensesSummaryQuery = InferRequestType<typeof $expensesSummary>['query'];

/** A window of expenses, plus the range the server actually read — it may have defaulted or clamped. */
export type ExpensesRange = InferResponseType<typeof $listExpenses, 200>;

/** One expense as the list endpoint returns it, with its category joined. */
export type Expense = ExpensesRange['items'][number];

/** What the window cost, and where it went. */
export type ExpensesSummary = InferResponseType<typeof $expensesSummary, 200>;

export type PatchExpensePayload = InferRequestType<typeof $patchExpense>['json'];

export { $createExpense, $deleteExpense, $patchExpense };

/** The expenses in one window. Each range/search/sort combination caches separately. */
export function listExpensesQueryOptions(query: ListExpensesQuery) {
  return queryOptions({
    queryKey: ['expenses', 'list', query],
    queryFn: async () => parseResponse($listExpenses({ query })),
  });
}

/**
 * What the window cost and where it went. Its own key, keyed by the range alone: the summary ignores
 * the search box and the category filter, so typing in either refetches the table and leaves this
 * cached.
 */
export function expensesSummaryQueryOptions(query: ExpensesSummaryQuery) {
  return queryOptions({
    queryKey: ['expenses', 'summary', query],
    queryFn: async () => parseResponse($expensesSummary({ query })),
  });
}

/**
 * Every expense list and summary. Any write can move a row between months, re-filter a list or shift
 * a total, so the whole prefix goes rather than a single key.
 */
export function invalidateExpenses(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['expenses'] });
}

/**
 * Swaps an updated expense into every cached window, so an inline edit shows its new value without
 * waiting for a refetch. Pair it with `invalidateExpenses`: this fixes the cell, the refetch fixes
 * the ordering, the filtering and the total.
 */
export function applyExpenseUpdate(queryClient: QueryClient, updated: Expense) {
  queryClient.setQueriesData<ExpensesRange>({ queryKey: ['expenses', 'list'] }, (range) =>
    range ? { ...range, items: range.items.map((expense) => (expense.id === updated.id ? updated : expense)) } : range
  );
}
