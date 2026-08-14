import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PiggyBankIcon } from 'lucide-react';

import { Button, Skeleton } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { expensesSummaryQueryOptions, listExpensesQueryOptions } from '@/modules/expenses';
import { currentMonth, currentYear, formatAmount, formatDate, monthRange } from '@/modules/shared';

import {
  DashboardCard,
  DashboardCardEmpty,
  type DashboardCardFrame,
  DashboardCardRow,
  DashboardCardRowsSkeleton,
} from './dashboard-card';

/** Enough to recognise the month's spending by; the table is one click away. */
const SHOWN = 4;

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  action: (
    <Button asChild size="sm" variant="ghost">
      <Link to="/expenses/monthly-expenses">
        View all
        <ArrowRightIcon />
      </Link>
    </Button>
  ),
  icon: PiggyBankIcon,
  title: "This month's spending",
} satisfies DashboardCardFrame;

/** Keyed by the same `monthRange` the expenses page uses, so the two share a cache entry. */
export const dashboardSpendingSummaryQueryOptions = () =>
  expensesSummaryQueryOptions(monthRange(currentMonth(), currentYear()));

/** The same month as the total, spelled out: the endpoint's own default is the *UTC* month. */
export const dashboardRecentExpensesQueryOptions = () =>
  listExpensesQueryOptions({
    ...monthRange(currentMonth(), currentYear()),
    pageSize: SHOWN,
    sortDirection: 'desc',
    sortKey: 'recordedAt',
  });

function SpendingCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      {/* The month total sits above the rows, and it's the tallest thing in the card. */}
      <Skeleton className="mb-2 h-7 w-32" />
      <DashboardCardRowsSkeleton rows={SHOWN} />
    </DashboardCard>
  );
}

export function SpendingCard() {
  const { data: summary } = useSuspenseQuery(dashboardSpendingSummaryQueryOptions());
  const { data: range } = useSuspenseQuery(dashboardRecentExpensesQueryOptions());

  const recent = range.items;

  return (
    <DashboardCard {...CARD}>
      {/* A list, because past rows keep whatever currency they were logged in. */}
      {summary.totals.length === 0 ? (
        <DashboardCardEmpty>Nothing logged this month.</DashboardCardEmpty>
      ) : (
        <>
          <div className="pb-2">
            {summary.totals.map((total) => (
              <div key={total.currency}>
                <p className="font-medium text-xl" data-testid="dashboard-month-total">
                  {formatAmount(total.spent, total.currency)}
                </p>
                {/* The total leaves these out, so a card of rows adding up to more needs saying why. */}
                {total.paidBack > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {formatAmount(total.paidBack, total.currency)} paid back
                  </p>
                ) : null}
              </div>
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
                {/* Struck through when paid back, as the expenses table strikes it. */}
                <span
                  className={cn('shrink-0 tabular-nums', expense.paidBackAt && 'text-muted-foreground line-through')}
                >
                  {formatAmount(expense.amount, expense.currency)}
                </span>
              </DashboardCardRow>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  );
}

SpendingCard.Skeleton = SpendingCardSkeleton;
