import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { BookUserIcon, CookingPotIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  Button,
  ButtonGroup,
  Skeleton,
} from '@homewise/ui/core';

import { ContactDialog, listContactsQueryOptions } from '@/modules/contacts';
import { ExpenseFormDialog } from '@/modules/expenses';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar, formatDate, PageLayout, RouteError, todayISODay } from '@/modules/shared';

import { BirthdaysCard } from './-components/birthdays-card';
import {
  dashboardChildProfilesQueryOptions,
  dashboardPetProfilesQueryOptions,
  FamilyProfilesCard,
} from './-components/family-profiles-card';
import { dashboardLoansQueryOptions, LoansCard } from './-components/loans-card';
import { dashboardRecentRecipesQueryOptions, RecentRecipesCard } from './-components/recent-recipes-card';
import { dashboardShoppingListsQueryOptions, ShoppingListsCard } from './-components/shopping-lists-card';
import {
  dashboardRecentExpensesQueryOptions,
  dashboardSpendingSummaryQueryOptions,
  SpendingCard,
} from './-components/spending-card';
import { WeekMealsCard, weekMealsQueryOptions } from './-components/week-meals-card';

export const Route = createFileRoute('/_authenticated/_onboarded/')({
  component: HomeRoute,
  pendingComponent: DashboardPending,
  errorComponent: () => <RouteError title="Couldn't load your dashboard" />,
  async loader({ context }) {
    // Warmed in parallel, or the page suspends once per card on the way in.
    await Promise.all([
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
      context.queryClient.ensureQueryData(weekMealsQueryOptions()),
      context.queryClient.ensureQueryData(dashboardShoppingListsQueryOptions()),
      context.queryClient.ensureQueryData(dashboardSpendingSummaryQueryOptions()),
      context.queryClient.ensureQueryData(dashboardRecentExpensesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardLoansQueryOptions()),
      context.queryClient.ensureQueryData(dashboardRecentRecipesQueryOptions()),
      context.queryClient.ensureQueryData(listContactsQueryOptions()),
      context.queryClient.ensureQueryData(dashboardChildProfilesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardPetProfilesQueryOptions()),
    ]);
  },
});

/** Off the local clock, so it agrees with the day the user is actually having. */
function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Two open a dialog the owning module already exports whole; two navigate, because creating a list
 * or a meal is wired into its own page's state.
 */
function QuickActions() {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <ButtonGroup>
        <Button onClick={() => setExpenseOpen(true)} size="sm" variant="outline">
          <PlusIcon />
          Expense
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/food/shopping-lists">
            <ListTodoIcon />
            Shopping list
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/food/meal-plan">
            <CookingPotIcon />
            Plan a meal
          </Link>
        </Button>
        <Button onClick={() => setContactOpen(true)} size="sm" variant="outline">
          <BookUserIcon />
          Contact
        </Button>
      </ButtonGroup>
      {/* Mounted only while open, so each dialog's form reseeds its defaults. */}
      {expenseOpen && (
        <ExpenseFormDialog defaultRecordedAt={todayISODay()} onOpenChange={setExpenseOpen} open={expenseOpen} />
      )}
      {contactOpen && <ContactDialog onOpenChange={setContactOpen} open={contactOpen} />}
    </>
  );
}

/** The page around the cards, so the loading state and the loaded one can't drift apart. */
function DashboardShell({ children, header }: { children: ReactNode; header: ReactNode }) {
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
      <PageLayout className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">{header}</div>
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </PageLayout>
    </>
  );
}

/**
 * The real layout with the data left out. Each card's title, icon and "View all" need no request, so
 * the page arrives whole and fills in — a full-page spinner would throw away everything we know.
 */
function DashboardPending() {
  return (
    <DashboardShell
      header={
        <>
          <div className="space-y-2 py-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-72 max-w-full" />
        </>
      }
    >
      <WeekMealsCard.Skeleton />
      <ShoppingListsCard.Skeleton />
      <BirthdaysCard.Skeleton />
      <SpendingCard.Skeleton />
      <LoansCard.Skeleton />
      <RecentRecipesCard.Skeleton />
      <FamilyProfilesCard.Skeleton />
    </DashboardShell>
  );
}

function HomeRoute() {
  const { user } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  return (
    <DashboardShell
      header={
        <>
          <div>
            <h1 className="font-medium text-lg">
              {greeting()}, {user.name}
            </h1>
            {/* A testid, because the sidebar names the household too and `main` is ambiguous. */}
            <p className="text-muted-foreground text-sm" data-testid="dashboard-greeting">
              {format(new Date(), 'EEEE')}, {formatDate(new Date())} · {household.name}
            </p>
          </div>
          <QuickActions />
        </>
      }
    >
      <WeekMealsCard />
      <ShoppingListsCard />
      <BirthdaysCard />
      <SpendingCard />
      <LoansCard />
      <RecentRecipesCard />
      <FamilyProfilesCard />
    </DashboardShell>
  );
}
