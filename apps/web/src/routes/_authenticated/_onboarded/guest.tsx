import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { format } from 'date-fns';

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, Skeleton } from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar, formatDate, PageLayout, RouteError } from '@/modules/shared';

import {
  dashboardChildProfilesQueryOptions,
  dashboardPetProfilesQueryOptions,
  FamilyProfilesCard,
} from './-components/family-profiles-card';
import { dashboardRecentRecipesQueryOptions, RecentRecipesCard } from './-components/recent-recipes-card';

/**
 * Home for a member who is family but not part of running the household — a grandparent.
 *
 * `/guest` rather than `/external`: the role is `external` in the data, but this is the page that
 * person actually looks at, and "guest" is what it reads as to them.
 *
 * Its own route rather than a filtered dashboard: the dashboard is eleven queries across eight
 * domains, and an external can reach three of them. Filtering it would mean a conditional per card,
 * per query and per skeleton; this is the same three cards with none of that.
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

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

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
      <FamilyProfilesCard.Skeleton />
      <RecentRecipesCard.Skeleton />
    </GuestShell>
  );
}

function GuestHomeRoute() {
  const { user } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  return (
    <GuestShell
      header={
        <div>
          <h1 className="font-medium text-lg">
            {greeting()}, {user.name}
          </h1>
          <p className="text-muted-foreground text-sm" data-testid="guest-greeting">
            {format(new Date(), 'EEEE')}, {formatDate(new Date())} · {household.name}
          </p>
        </div>
      }
    >
      <FamilyProfilesCard />
      <RecentRecipesCard />
    </GuestShell>
  );
}
