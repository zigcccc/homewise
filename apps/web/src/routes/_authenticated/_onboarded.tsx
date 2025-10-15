import { SidebarInset } from '@homewise/ui/core/sidebar';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getMyHouseholdQueryOptions } from '@/modules/households';

import { Actionbar } from './-components/Actionbar';
import { AppSidebar } from './-components/AppSidebar';

export const Route = createFileRoute('/_authenticated/_onboarded')({
  async beforeLoad({ context }) {
    const household = await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()).catch(() => null);

    if (!household) {
      throw redirect({ to: '/onboarding/create-household' });
    }

    return { ...context, householdId: household.id };
  },
  component: OnboardedRouteComponent,
});

function OnboardedRouteComponent() {
  const { householdId } = Route.useRouteContext();

  return (
    <>
      {householdId && <AppSidebar />}
      <SidebarInset>
        <Actionbar.Provider>
          <Actionbar.Root />
          <Outlet />
        </Actionbar.Provider>
      </SidebarInset>
    </>
  );
}
