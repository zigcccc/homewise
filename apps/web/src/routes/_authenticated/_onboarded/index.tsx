import { createFileRoute, Link, type LinkProps, redirect } from '@tanstack/react-router';
import { BookUserIcon, CookingPotIcon, ListTodoIcon, type LucideIcon, PlusIcon, ZapIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, useCallback, useMemo, useState } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  Button,
  ButtonGroup,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
} from '@homewise/ui/core';
import { useIsMobile } from '@homewise/ui/hooks';

import { ContactDialog } from '@/modules/contacts';
import { ExpenseFormDialog } from '@/modules/expenses';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar, canRole, PageLayout, RouteError, todayISODay, useHouseholdRole } from '@/modules/shared';

import { ActivityCard, dashboardActivityQueryOptions } from './-components/activity-card';
import { BirthdaysCard, dashboardBirthdayContactsQueryOptions } from './-components/birthdays-card';
import {
  dashboardChildProfilesQueryOptions,
  dashboardPetProfilesQueryOptions,
  FamilyProfilesCard,
} from './-components/family-profiles-card';
import { HomeGreeting } from './-components/home-greeting';
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
  // An external's home is `/guest` — this dashboard is eleven queries they mostly cannot make. Here
  // rather than in the layout above, which would have to test the pathname to find this one route.
  beforeLoad({ context }) {
    if (context.role === 'external') {
      throw redirect({ to: '/guest' });
    }
  },
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
      context.queryClient.ensureQueryData(dashboardBirthdayContactsQueryOptions()),
      context.queryClient.ensureQueryData(dashboardChildProfilesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardPetProfilesQueryOptions()),
      context.queryClient.ensureQueryData(dashboardActivityQueryOptions()),
    ]);
  },
});

/** Two shapes: some actions open a dialog, some navigate. */
type QuickAction = { icon: LucideIcon; key: string; label: string } & (
  | { onSelect: () => void }
  | { to: LinkProps['to'] }
);

/** One action, rendered the same way in the desktop row and in the mobile sheet. */
function QuickActionButton({
  action,
  className,
  onActivate,
  size,
}: {
  action: QuickAction;
  className?: string;
  onActivate?: () => void;
  size?: ComponentProps<typeof Button>['size'];
}) {
  const Icon = action.icon;

  if ('to' in action) {
    return (
      <Button asChild className={className} onClick={onActivate} size={size} variant="outline">
        <Link to={action.to}>
          <Icon />
          {action.label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      className={className}
      onClick={() => {
        action.onSelect();
        onActivate?.();
      }}
      size={size}
      variant="outline"
    >
      <Icon />
      {action.label}
    </Button>
  );
}

/**
 * Two open a dialog the owning module already exports whole; two navigate, because creating a list
 * or a meal is wired into its own page's state.
 *
 * Below `md` they collapse into a sheet: `ButtonGroup` never wraps, so the row outgrew a phone.
 */
function QuickActions() {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState<'contact' | 'expense' | null>(null);

  const role = useHouseholdRole();
  // Every one of these starts a write, so a member who can't make one is offered nothing at all.
  const actions = useMemo(
    () =>
      (
        [
          {
            area: 'expenses',
            icon: PlusIcon,
            key: 'expense',
            label: 'Expense',
            onSelect: () => setOpenDialog('expense'),
          },
          {
            area: 'shoppingLists',
            icon: ListTodoIcon,
            key: 'shopping-list',
            label: 'Shopping list',
            to: '/food/shopping-lists',
          },
          { area: 'mealPlan', icon: CookingPotIcon, key: 'meal-plan', label: 'Plan a meal', to: '/food/meal-plan' },
          {
            area: 'contacts',
            icon: BookUserIcon,
            key: 'contact',
            label: 'Contact',
            onSelect: () => setOpenDialog('contact'),
          },
        ] as const
      ).filter((action) => canRole(role, action.area, 'write')),
    [role]
  );
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  if (actions.length === 0) {
    return null;
  }

  return (
    <>
      {isMobile ? (
        <Sheet onOpenChange={setSheetOpen} open={sheetOpen}>
          <SheetTrigger asChild>
            <Button className="w-full" variant="outline">
              <ZapIcon />
              Quick actions
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Quick actions</SheetTitle>
              <SheetDescription className="sr-only">Start something without leaving the dashboard.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-2 px-4 pb-8">
              {actions.map((action) => (
                <QuickActionButton
                  action={action}
                  className="w-full justify-start"
                  key={action.key}
                  onActivate={closeSheet}
                />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <ButtonGroup>
          {actions.map((action) => (
            <QuickActionButton action={action} key={action.key} size="sm" />
          ))}
        </ButtonGroup>
      )}
      {/* Mounted only while open, so each dialog's form reseeds its defaults. */}
      {openDialog === 'expense' && (
        <ExpenseFormDialog
          defaultRecordedAt={todayISODay()}
          onOpenChange={(open) => setOpenDialog(open ? 'expense' : null)}
          open
        />
      )}
      {openDialog === 'contact' && (
        <ContactDialog onOpenChange={(open) => setOpenDialog(open ? 'contact' : null)} open />
      )}
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
          {/* One full-width trigger below `md`, the four-button row above it. */}
          <Skeleton className="h-9 w-full md:h-8 md:w-72" />
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
      <ActivityCard.Skeleton />
    </DashboardShell>
  );
}

function HomeRoute() {
  const { user } = Route.useRouteContext();

  return (
    <DashboardShell
      header={
        <>
          <HomeGreeting testId="dashboard-greeting" userName={user.name} />
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
      <ActivityCard />
    </DashboardShell>
  );
}
