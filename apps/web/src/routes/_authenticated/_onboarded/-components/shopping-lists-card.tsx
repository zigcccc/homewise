import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ListTodoIcon } from 'lucide-react';

import { Badge, Button } from '@homewise/ui/core';

import { listQueryFor, listShoppingListsQueryOptions, listTitle, remainingCount } from '@/modules/shopping-lists';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** How many lists fit before the card starts competing with the page it links to. */
const SHOWN = 4;

/**
 * The open lists, keyed through `listQueryFor` rather than a hand-written `{ includeCompleted:
 * 'false' }`. That helper exists precisely so the spelling can't fork: two spellings of the query
 * are two cache entries, and the dashboard would refetch what `/food/shopping-lists` already holds.
 */
export const dashboardShoppingListsQueryOptions = () => listShoppingListsQueryOptions(listQueryFor({}));

export function ShoppingListsCard() {
  const { data: lists } = useSuspenseQuery(dashboardShoppingListsQueryOptions());

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
      {lists.length === 0 ? (
        <DashboardCardEmpty>Nothing to buy — no list is open.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {lists.slice(0, SHOWN).map((list) => {
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
