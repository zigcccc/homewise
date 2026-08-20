import { createFileRoute, redirect } from '@tanstack/react-router';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, Skeleton } from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar, PageLayout, RouteError } from '@/modules/shared';

import {
  dashboardChildProfilesQueryOptions,
  dashboardPetProfilesQueryOptions,
  FamilyProfilesCard,
} from './-components/family-profiles-card';
import { HomeGreeting } from './-components/home-greeting';
import { dashboardRecentRecipesQueryOptions, RecentRecipesCard } from './-components/recent-recipes-card';

/**
 * Home for a member who is family but not part of running the household — a grandparent.
 *
 * `/guest` rather than `/external`: the role is `external` in the data, but "guest" is what the page
 * reads as to the person looking at it.
 */
export const Route = createFileRoute('/_authenticated/_onboarded/guest')({
  beforeLoad({ context }) {
    if (context.role !== 'external') {
      throw redirect({ to: '/' });
    }
  },
  component: GuestHomeRoute,
  pendingComponent: GuestHomePending,
  errorComponent: () => <RouteError title="Couldn't load your home" />,
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
      context.queryClient.ensureQueryData(dashboardChildProfilesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardPetProfilesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardRecentRecipesQueryOptions()),
    ]);
  },
});

/** The page around the cards, so the loading state and the loaded one can't drift apart. */
function GuestShell({ children, header }: { children: React.ReactNode; header: React.ReactNode }) {
  return (
    <>
      <Actionbar.Content>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Home</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>
      <PageLayout className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">{header}</div>
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </PageLayout>
    </>
  );
}

function GuestHomePending() {
  return (
    <GuestShell
      header={
        <div className="space-y-2 py-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      }
    >
      <FamilyProfilesCard.Skeleton wide />
      <RecentRecipesCard.Skeleton />
    </GuestShell>
  );
}

function GuestHomeRoute() {
  const { user } = Route.useRouteContext();

  return (
    <GuestShell header={<HomeGreeting testId="guest-greeting" userName={user.name} />}>
      <FamilyProfilesCard wide />
      <RecentRecipesCard />
    </GuestShell>
  );
}
