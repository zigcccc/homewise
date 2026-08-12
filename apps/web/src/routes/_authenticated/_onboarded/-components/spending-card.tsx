import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PiggyBankIcon } from 'lucide-react';

import { Button } from '@homewise/ui/core';

import { expensesSummaryQueryOptions, listExpensesQueryOptions } from '@/modules/expenses';
import { currentMonth, currentYear, formatAmount, formatDate, monthRange } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** Enough to recognise the month's spending by; the table is one click away. */
const SHOWN = 4;

/** Keyed by the same `monthRange` the expenses page uses, so the two share a cache entry. */
export const dashboardSpendingSummaryQueryOptions = () =>
  expensesSummaryQueryOptions(monthRange(currentMonth(), currentYear()));

/** Newest first. No `from`/`to` — the endpoint already defaults its window to the current month. */
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
      {/* A list, because past rows keep whatever currency they were logged in. */}
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
