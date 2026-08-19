import { setTag } from '@sentry/react';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { can } from '@homewise/server/permissions';
import { SidebarInset, Spinner } from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { getRealtimeChannelQueryOptions } from '@/modules/realtime';
// Imported from the components barrel rather than the domain one on purpose: this pulls in the Ably
// client, and only the component below uses it, so autoCodeSplitting keeps it out of the main bundle.
import { RealtimeProvider } from '@/modules/realtime/components';
import { Actionbar, areaForPath } from '@/modules/shared';

import { AppSidebar } from './-components/AppSidebar';

export const Route = createFileRoute('/_authenticated/_onboarded')({
  async beforeLoad({ context, location }) {
    const household = await context.queryClient
      .ensureQueryData(getMyHouseholdQueryOptions())
      .catch((error: unknown) => {
        // A role with no household access at all (a pet, from before pets were barred from holding an
        // account) 403s here. Without this it would look like "no household yet" and be walked into
        // onboarding, where it would create a second one.
        if (error instanceof Error && error.cause === 403) {
          throw redirect({ to: '/no-access' });
        }

        return null;
      });

    if (!household) {
      throw redirect({ to: '/onboarding/create-household' });
    }

    const { role } = household.viewer;

    // An external's home is its own route — the dashboard is eleven queries they mostly cannot make.
    if (role === 'external' && location.pathname === '/') {
      throw redirect({ to: '/guest' });
    }

    // The one place a section is checked, off the same map the sidebar renders from.
    const section = areaForPath(location.pathname);
    if (section && !can(role, section.area, section.access ?? 'read')) {
      throw redirect({ to: role === 'external' ? '/guest' : '/' });
    }

    // After the household, not alongside it: the channel is cached per household id, and there's no
    // point asking for one before we know there is a household. Both are cached, so this costs a
    // round trip on first entry only — and it resolves the channel before first render, so its
    // provider never has to swap in later and remount the app underneath it.
    //
    // Uncaught on purpose, for the roles that get one. The server can't boot without a broker
    // configured and we've just proven the household exists, so the only way this fails is the API
    // being unreachable — in which case the household query above would have failed too.
    //
    // An external gets none: there is a single channel per household and every event carries the
    // display name of what changed, so subscribing would hand them the names of shopping lists,
    // expenses and contacts they are not allowed to read. Their data is near-static, and a refetch on
    // navigation covers it — don't wire this back in.
    const realtimeChannel = can(role, 'realtime', 'read')
      ? (await context.queryClient.ensureQueryData(getRealtimeChannelQueryOptions(household.id))).name
      : null;

    // Matches the tag the server sets in `withHousehold`, so both halves of a report filter the same way.
    setTag('householdId', household.id);

    return { ...context, householdId: household.id, realtimeChannel, role };
  },
  component: OnboardedRouteComponent,
  // `beforeLoad` now awaits two requests, and this is the shell every authenticated page renders
  // inside — so on a cold cache there's a window with nothing on screen. Full-viewport, matching
  // `_authenticated`: at this point the sidebar hasn't rendered either.
  pendingComponent: () => <Spinner className="min-h-dvh min-w-dvw" />,
});

function OnboardedRouteComponent() {
  const { householdId, realtimeChannel } = Route.useRouteContext();

  // No channel means this role doesn't get live updates — see `beforeLoad`. The provider is skipped
  // entirely rather than handed a null, so the Ably client is never even constructed for them.
  const shell = (
    <>
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
    </>
  );

  return realtimeChannel ? <RealtimeProvider channel={realtimeChannel}>{shell}</RealtimeProvider> : shell;
}
