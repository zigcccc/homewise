import { createFileRoute, redirect } from '@tanstack/react-router';

import { Spinner } from '@homewise/ui/core';
import { isMobileViewport } from '@homewise/ui/hooks';

import { listQueryFor, listShoppingListsQueryOptions } from '@/modules/shopping-lists';

/**
 * The detail pane with nothing selected.
 *
 * On a wide screen that would waste half the page, so it jumps to the first list — `replace`, so the
 * back button leaves the section instead of bouncing back here. On a phone the two columns can't
 * coexist: auto-selecting would hide the list of lists the moment you arrived, so this stays put and
 * the master column keeps the screen. With no lists at all it stays put too — the layout replaces
 * the whole two-column shell with a full-width empty state, so there is no pane to fill.
 *
 * The jump is a `beforeLoad` redirect rather than a `<Navigate>` rendered by the component. Both
 * express "landing here sends you on", but only this one is part of the navigation: `$listId`'s
 * loader can redirect straight back out (a completed list while the filter hides it), and two
 * redirects inside one navigation resolve against each other exactly once. Rendering the jump
 * instead makes the return trip a fresh render that fires it again — an endless bounce between the
 * two, which is what `serial-seed-mutations.spec.ts` caught.
 */
export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists/')({
  async beforeLoad({ context, search }) {
    if (isMobileViewport()) {
      return;
    }

    const lists = await context.queryClient.ensureQueryData(listShoppingListsQueryOptions(listQueryFor(search)));
    const first = lists[0];

    if (first) {
      throw redirect({
        params: { listId: first.id.toString() },
        replace: true,
        search,
        to: '/food/shopping-lists/$listId',
      });
    }
  },
  component: () => null,
  pendingComponent: () => <Spinner />,
});
