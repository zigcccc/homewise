import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { SidebarInset, Spinner } from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { getRealtimeChannelQueryOptions } from '@/modules/realtime';
// Imported from the components barrel rather than the domain one on purpose: this pulls in the Ably
// client, and only the component below uses it, so autoCodeSplitting keeps it out of the main bundle.
import { RealtimeProvider } from '@/modules/realtime/components';
import { Actionbar } from '@/modules/shared';

import { AppSidebar } from './-components/AppSidebar';

export const Route = createFileRoute('/_authenticated/_onboarded')({
  async beforeLoad({ context }) {
    const household = await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()).catch(() => null);

    if (!household) {
      throw redirect({ to: '/onboarding/create-household' });
    }

    // After the household, not alongside it: the channel is cached per household id, and there's no
    // point asking for one before we know there is a household. Both are cached, so this costs a
    // round trip on first entry only — and it resolves the channel before first render, so its
    // provider never has to swap in later and remount the app underneath it.
    //
    // Uncaught on purpose. The server can't boot without a broker configured and we've just proven
    // the household exists, so the only way this fails is the API being unreachable — in which case
    // the household query above would have failed too. Falling back to "run without live updates"
    // would trade a visible error for a session that silently stops seeing other members.
    const { name: realtimeChannel } = await context.queryClient.ensureQueryData(
      getRealtimeChannelQueryOptions(household.id)
    );

    return { ...context, householdId: household.id, realtimeChannel };
  },
  component: OnboardedRouteComponent,
  // `beforeLoad` now awaits two requests, and this is the shell every authenticated page renders
  // inside — so on a cold cache there's a window with nothing on screen. Full-viewport, matching
  // `_authenticated`: at this point the sidebar hasn't rendered either.
  pendingComponent: () => <Spinner className="min-h-dvh min-w-dvw" />,
});

function OnboardedRouteComponent() {
  const { householdId, realtimeChannel } = Route.useRouteContext();

  return (
    <RealtimeProvider channel={realtimeChannel}>
      {householdId && <AppSidebar />}
      <SidebarInset>
        <Actionbar.Provider>
          <Actionbar.Root />
          <Outlet />
        </Actionbar.Provider>
      </SidebarInset>
    </RealtimeProvider>
  );
}
