import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PiggyBankIcon } from 'lucide-react';

import { Button } from '@homewise/ui/core';

import { expensesSummaryQueryOptions, listExpensesQueryOptions } from '@/modules/expenses';
import { currentMonth, currentYear, formatAmount, formatDate, monthRange } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** Enough to recognise the month's spending by; the table is one click away. */
const SHOWN = 4;

/**
 * The month's total, keyed by the same `monthRange` the expenses page uses so the two share a cache
 * entry. The summary takes no search or category — it describes the whole window.
 */
export const dashboardSpendingSummaryQueryOptions = () =>
  expensesSummaryQueryOptions(monthRange(currentMonth(), currentYear()));

/**
 * The month's expenses, newest first. No `from`/`to`: the endpoint defaults its window to the
 * current month server-side, which is exactly what this card wants and one less thing to keep in
 * step with the clock.
 */
export const dashboardRecentExpensesQueryOptions = () =>
  listExpensesQueryOptions({ sortDirection: 'desc', sortKey: 'recordedAt' });

export function SpendingCard() {
  const { data: summary } = useSuspenseQuery(dashboardSpendingSummaryQueryOptions());
  const { data: range } = useSuspenseQuery(dashboardRecentExpensesQueryOptions());

  const recent = range.expenses.slice(0, SHOWN);

  return (
    <DashboardCard
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/expenses/monthly-expenses">
            View all
            <ArrowRightIcon />
          </Link>
        </Button>
      }
      icon={PiggyBankIcon}
      title="This month's spending"
    >
      {/* `totals` is a list because a household can change what it counts in, and past rows keep the
          currency they were logged in — the same reason the expenses page renders one line each. */}
      {summary.totals.length === 0 ? (
        <DashboardCardEmpty>Nothing logged this month.</DashboardCardEmpty>
      ) : (
        <>
          <div className="pb-2">
            {summary.totals.map((total) => (
              <p className="font-medium text-xl" data-testid="dashboard-month-total" key={total.currency}>
                {formatAmount(total.spent, total.currency)}
              </p>
            ))}
          </div>
          <div className="divide-y">
            {recent.map((expense) => (
              <DashboardCardRow key={expense.id}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{expense.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {expense.category?.name ?? 'Uncategorised'} · {formatDate(expense.recordedAt)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatAmount(expense.amount, expense.currency)}</span>
              </DashboardCardRow>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  );
}
