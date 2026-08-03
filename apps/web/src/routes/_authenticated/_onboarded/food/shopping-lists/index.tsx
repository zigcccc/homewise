import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { ListTodoIcon } from 'lucide-react';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Spinner } from '@homewise/ui/core';
import { useIsMobile } from '@homewise/ui/hooks';

import { listShoppingListsQueryOptions } from '@/modules/shopping-lists';

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
 */
function ShoppingListsIndex() {
  const isMobile = useIsMobile();
  const { includeCompleted } = Route.useSearch();
  const { data: lists } = useSuspenseQuery(
    listShoppingListsQueryOptions({ includeCompleted: includeCompleted ? 'true' : 'false' })
  );

  if (isMobile) {
    return null;
  }

  const first = lists[0];

  if (first) {
    return <Navigate params={{ listId: first.id.toString() }} replace to="/food/shopping-lists/$listId" />;
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListTodoIcon />
        </EmptyMedia>
        <EmptyTitle>No shopping list open</EmptyTitle>
        <EmptyDescription>Start a list to collect what you need to buy.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
