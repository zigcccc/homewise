import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PackageOpenIcon } from 'lucide-react';

import { Badge, Button } from '@homewise/ui/core';

import { formatDate } from '@/modules/shared';
import { LOAN_STATUS_LABELS, listStorageItemsQueryOptions, resolveLoanStatus } from '@/modules/storage-items';

import {
  DashboardCard,
  DashboardCardEmpty,
  type DashboardCardFrame,
  DashboardCardRow,
  DashboardCardRowsSkeleton,
} from './dashboard-card';

/** Enough to chase; the items table has the rest. */
const SHOWN = 4;

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  action: (
    <Button asChild size="sm" variant="ghost">
      <Link search={{ loanStatus: 'onLoan' }} to="/storage/items">
        View all
        <ArrowRightIcon />
      </Link>
    </Button>
  ),
  icon: PackageOpenIcon,
  title: 'Out on loan',
} satisfies DashboardCardFrame;

/**
 * `onLoan` is `borrowed_on IS NOT NULL` server-side, so this includes the overdue ones.
 *
 * `dueOn` ascending *is* the overdue-first order this card wants, so the server can cut the page to
 * size: everything overdue is due before today and everything else after it, which puts the whole
 * overdue group first without ranking on the status; and Postgres sorts NULLs last on an ascending
 * sort, which leaves the open-ended loans trailing exactly where a missing due date belongs.
 */
export const dashboardLoansQueryOptions = () =>
  listStorageItemsQueryOptions({ loanStatus: 'onLoan', pageSize: SHOWN, sortDirection: 'asc', sortKey: 'dueOn' });

function LoansCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <DashboardCardRowsSkeleton rows={SHOWN} />
    </DashboardCard>
  );
}

export function LoansCard() {
  const { data: items } = useSuspenseQuery(dashboardLoansQueryOptions());

  // Already overdue-first and already cut to size — see the query above.
  const onLoan = items.items;

  return (
    <DashboardCard {...CARD}>
      {onLoan.length === 0 ? (
        <DashboardCardEmpty>Everything is where it should be.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {onLoan.map((item) => {
            const status = resolveLoanStatus(item.loan);

            return (
              <DashboardCardRow key={item.id}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {item.loan?.name}
                    {item.loan?.dueOn ? ` · due ${formatDate(item.loan.dueOn)}` : ''}
                  </span>
                </span>
                <Badge variant={status === 'overdue' ? 'destructive' : 'secondary'}>{LOAN_STATUS_LABELS[status]}</Badge>
              </DashboardCardRow>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

LoansCard.Skeleton = LoansCardSkeleton;
