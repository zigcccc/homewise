import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PackageOpenIcon } from 'lucide-react';

import { Badge, Button } from '@homewise/ui/core';

import { formatDate } from '@/modules/shared';
import { LOAN_STATUS_LABELS, listStorageItemsQueryOptions, resolveLoanStatus } from '@/modules/storage-items';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** Enough to chase; the items table has the rest. */
const SHOWN = 4;

/**
 * Everything currently lent out. `onLoan` is `borrowed_on IS NOT NULL` server-side, so it **includes**
 * the overdue ones — one query covers both states, and which is which is decided per row below.
 */
export const dashboardLoansQueryOptions = () => listStorageItemsQueryOptions({ loanStatus: 'onLoan' });

export function LoansCard() {
  const { data: items } = useSuspenseQuery(dashboardLoansQueryOptions());

  // Overdue first: this card exists to be acted on, and the thing to act on is what's late.
  const onLoan = [...items].sort((a, b) => {
    const overdue = Number(resolveLoanStatus(b.loan) === 'overdue') - Number(resolveLoanStatus(a.loan) === 'overdue');

    // An open-ended loan has no due date to rank by, so it settles behind anything that has one.
    return overdue || (a.loan?.dueOn ?? '9999').localeCompare(b.loan?.dueOn ?? '9999');
  });

  return (
    <DashboardCard
      action={
        <Button asChild size="sm" variant="ghost">
          <Link search={{ loanStatus: 'onLoan' }} to="/storage/items">
            View all
            <ArrowRightIcon />
          </Link>
        </Button>
      }
      icon={PackageOpenIcon}
      title="Out on loan"
    >
      {onLoan.length === 0 ? (
        <DashboardCardEmpty>Everything is where it should be.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {onLoan.slice(0, SHOWN).map((item) => {
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
