import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_onboarded/expenses/monthly-expenses/')({
  // The page *is* the layout. `/categories` overlays the table rather than replacing it, so the
  // table has to stay mounted while that route is active — which means it can't live here. This
  // route exists so the layout has an explicit index rather than an accidentally empty Outlet.
  component: () => null,
});
