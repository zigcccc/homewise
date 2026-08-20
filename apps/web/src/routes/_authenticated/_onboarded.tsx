import { setTag } from '@sentry/react';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { can } from '@homewise/server/permissions';
import { SidebarInset, Spinner } from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { getRealtimeChannelQueryOptions } from '@/modules/realtime';
// Imported from the components barrel rather than the domain one on purpose: this pulls in the Ably
// client, and only the component below uses it, so autoCodeSplitting keeps it out of the main bundle.
import { RealtimeProvider } from '@/modules/realtime/components';
import { Actionbar, RouteError, sectionForPath } from '@/modules/shared';

import { AppSidebar } from './-components/AppSidebar';

export const Route = createFileRoute('/_authenticated/_onboarded')({
  async beforeLoad({ context, location }) {
    // Only a 404 means "no household yet" — swallowing the rest sends a member into creating a second.
    const household = await context.queryClient
      .ensureQueryData(getMyHouseholdQueryOptions())
      .catch((error: unknown) => {
        if (error instanceof Error && error.cause === 404) {
          return null;
        }

        throw error;
      });

    if (!household) {
      throw redirect({ to: '/onboarding/create-household' });
    }

    const { role } = household.viewer;

    // The one place a section is checked, off the same map the sidebar renders from.
    const section = sectionForPath(location.pathname);
    if (section && !can(role, section.area, section.access ?? 'read')) {
      throw redirect({ to: role === 'external' ? '/guest' : '/' });
    }

    // After the household, not alongside it: the channel is cached per household id, and there's no
    // point asking for one before we know there is a household. Both are cached, so this costs a
    // round trip on first entry only — and it resolves the channel before first render, so its
    // provider never has to swap in later and remount the app underneath it.
    //
    // Uncaught on purpose. The server can't boot without a broker configured and we've just proven
    // the household exists, so the only way this fails is the API being unreachable — in which case
    // the household query above would have failed too.
    //
    // Which channel comes back depends on the role — that decision is the server's, not ours.
    const realtimeChannel = (
      await context.queryClient.ensureQueryData(getRealtimeChannelQueryOptions(household.id, role))
    ).name;

    // Matches the tag the server sets in `withHousehold`, so both halves of a report filter the same way.
    setTag('householdId', household.id);

    return { ...context, householdId: household.id, realtimeChannel, role };
  },
  component: OnboardedRouteComponent,
  // `beforeLoad` now awaits two requests, and this is the shell every authenticated page renders
  // inside — so on a cold cache there's a window with nothing on screen. Full-viewport, matching
  // `_authenticated`: at this point the sidebar hasn't rendered either.
  pendingComponent: () => <Spinner className="min-h-dvh min-w-dvw" />,
  // Without one, a failure here replaces the whole app with the router's default.
  errorComponent: () => <RouteError title="Couldn't open your household" />,
});

function OnboardedRouteComponent() {
  const { householdId, realtimeChannel } = Route.useRouteContext();

  return (
    <RealtimeProvider channel={realtimeChannel}>
      {householdId && <AppSidebar />}
      <SidebarInset className="overflow-hidden">
        <Actionbar.Provider>
          <Actionbar.Root />
          {/* The app's scrollport. Routes are unchanged by it — a `<main className="flex-1 …">` that
              outgrows the viewport scrolls here instead of scrolling the document — but a route that
              wants to scroll something *inside* itself now has a bounded ancestor to work from, which
              is what lets the shopping lists give each of its two columns its own scrollbar.

              The id is for scroll restoration: the router tracks any scrolled element, but keys it by a
              generated `nth-child` path unless it finds this attribute, so without it a route-tree
              change silently invalidates every cached position. It's also what
              `scrollToTopSelectors` (see `main.tsx`) names — `window` no longer scrolls, so the
              router's own scroll-to-top on navigation would otherwise have nothing to reset. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-scroll-restoration-id="app-content">
            <Outlet />
          </div>
        </Actionbar.Provider>
      </SidebarInset>
    </RealtimeProvider>
  );
}
