import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@homewise/ui/core/breadcrumb';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { getMyHouseholdQueryOptions } from '@/modules/households';

import { Actionbar } from '../-components/Actionbar';

export const Route = createFileRoute('/_authenticated/_onboarded/')({
  component: HomeRoute,
  pendingComponent: () => <p>Loading...</p>,
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions());
  },
});

function HomeRoute() {
  const { user } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  return (
    <>
      <Actionbar.Content>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>
      <div>
        <h1>Hello {user.name}!</h1>
        <div className="mt-4">
          <h2>Your household: {household.name}</h2>
        </div>
      </div>
    </>
  );
}
