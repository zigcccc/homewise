import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';

import { Spinner } from '@homewise/ui/core';
import { useIsMobile } from '@homewise/ui/hooks';

import { listQueryFor, listShoppingListsQueryOptions } from '@/modules/shopping-lists';

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists/')({
  component: ShoppingListsIndex,
  pendingComponent: () => <Spinner />,
});

/**
 * The detail pane with nothing selected.
 *
 * On a wide screen that would waste half the page, so it jumps to the first list — `replace`, so the
 * back button leaves the section instead of bouncing back here. On a phone the two columns can't
 * coexist: auto-selecting would hide the list of lists the moment you arrived, so this renders
 * nothing and the master column keeps the screen. `useIsMobile` reads `matchMedia` synchronously, so
 * there's no select-then-jump flash on first paint.
 *
 * With no lists at all this renders nothing either — the layout replaces the whole two-column shell
 * with a full-width empty state, so there is no pane for this to fill.
 */
function ShoppingListsIndex() {
  const isMobile = useIsMobile();
  const searchParams = Route.useSearch();
  const { data: lists } = useSuspenseQuery(listShoppingListsQueryOptions(listQueryFor(searchParams)));

  const first = lists[0];

  if (isMobile || !first) {
    return null;
  }

  return <Navigate params={{ listId: first.id.toString() }} replace to="/food/shopping-lists/$listId" />;
}
