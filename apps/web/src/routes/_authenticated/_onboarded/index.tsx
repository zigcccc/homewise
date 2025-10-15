import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { getReadHouseholdQueryOptions } from '@/modules/households';

export const Route = createFileRoute('/_authenticated/_onboarded/')({
  component: HomeRoute,
  pendingComponent: () => <p>Loading...</p>,
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getReadHouseholdQueryOptions(context.householdId));
  },
});

function HomeRoute() {
  const { householdId, user } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getReadHouseholdQueryOptions(householdId));

  return (
    <div>
      <h1>Hello {user.name}!</h1>
      <div className="mt-4">
        <h2>Your household: {household.name}</h2>
      </div>
    </div>
  );
}
