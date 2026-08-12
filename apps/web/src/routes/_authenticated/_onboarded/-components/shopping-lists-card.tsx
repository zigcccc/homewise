import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ListTodoIcon } from 'lucide-react';

import { Badge, Button } from '@homewise/ui/core';

import { listQueryFor, listShoppingListsQueryOptions, listTitle, remainingCount } from '@/modules/shopping-lists';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** Enough to act on; the page has the rest. */
const SHOWN = 4;

/** Through `listQueryFor`, not a hand-written filter — two spellings of the query are two caches. */
export const dashboardShoppingListsQueryOptions = () => listShoppingListsQueryOptions(listQueryFor({}));

export function ShoppingListsCard() {
  const { data: lists } = useSuspenseQuery(dashboardShoppingListsQueryOptions());

  const open = lists.slice(0, SHOWN);

  return (
    <DashboardCard
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/food/shopping-lists">
            View all
            <ArrowRightIcon />
          </Link>
        </Button>
      }
      icon={ListTodoIcon}
      title="Shopping lists"
    >
      {open.length === 0 ? (
        <DashboardCardEmpty>Nothing to buy — no list is open.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {open.map((list) => {
            const remaining = remainingCount(list);

            return (
              <DashboardCardRow key={list.id}>
                <Link
                  className="truncate hover:underline"
                  params={{ listId: String(list.id) }}
                  to="/food/shopping-lists/$listId"
                >
                  {listTitle(list)}
                </Link>
                <Badge variant={remaining === 0 ? 'secondary' : 'muted'}>
                  {remaining === 0 ? 'All ticked off' : `${remaining} of ${list.itemCount} left`}
                </Badge>
              </DashboardCardRow>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
