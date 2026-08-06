import { createFileRoute } from '@tanstack/react-router';

import { ExpenseCategoriesSheet, listExpenseCategoriesQueryOptions } from '@/modules/expense-categories';

export const Route = createFileRoute('/_authenticated/_onboarded/expenses/monthly-expenses/categories')({
  async loader({ context }) {
    await context.queryClient.ensureQueryData(listExpenseCategoriesQueryOptions());
  },
  component: CategoriesSheetRoute,
  // Not a bare `<Spinner />`: this renders into the parent's `<Outlet />`, at the bottom of the page,
  // so a loose spinner would appear in the page body while the URL says a sheet is opening. The
  // parent's loader warms the same query, so this only ever shows on a cold deep-link.
  pendingComponent: () => <CategoriesSheetRoute pending />,
});

/**
 * The categories sheet, open because this route is matched.
 *
 * Closing navigates back to the parent, which drops this route and unmounts the panel. `month`,
 * `year` and the filters survive that trip through the layout's `retainSearchParams`.
 */
function CategoriesSheetRoute({ pending = false }: { pending?: boolean }) {
  const navigate = Route.useNavigate();

  return (
    <ExpenseCategoriesSheet onClose={() => void navigate({ to: '/expenses/monthly-expenses' })} pending={pending} />
  );
}
