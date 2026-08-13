import { DragDropProvider } from '@dnd-kit/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import z from 'zod';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ButtonGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@homewise/ui/core';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import {
  currentWeekStart,
  eligibleMembers,
  groupIntoWeeks,
  mealPlanRangeQueryOptions,
  rangeFor,
  rangeLabel,
  shiftWeeks,
  toDaysWithMeals,
  toWeekStart,
  useMealMove,
} from '@/modules/meal-plan';
import { listRecipeOptionsQueryOptions } from '@/modules/recipes';
import { Actionbar, PageLayout } from '@/modules/shared';

import { MealPlanDayRow } from './-components/meal-plan-day';

const searchParamsModel = z.object({
  /**
   * Optional in, always a Monday out — so `/food/meal-plan` is a valid link with no search at all
   * (the sidebar's), and any date lands on the start of its week.
   *
   * The fallback is a function, not a value: `.catch(currentWeekStart())` would evaluate once when
   * this chunk is first loaded and hand back that same week for the rest of the tab's life.
   */
  from: z.iso
    .date()
    .optional()
    .catch(undefined)
    .transform((value) => toWeekStart(value ?? currentWeekStart())),
  /** How many weeks are on screen at once. Prev/next steps by exactly this much. */
  weeks: z
    .union([z.literal(1), z.literal(2), z.literal(4)])
    .default(1)
    .catch(1),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/meal-plan/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => rangeFor(search.from, search.weeks),
  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.ensureQueryData(mealPlanRangeQueryOptions(deps)),
      // Both feed the add/edit dialog's pickers, so the first "add" opens without a spinner.
      context.queryClient.ensureQueryData(listRecipeOptionsQueryOptions({ sortDirection: 'asc', sortKey: 'title' })),
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
    ]);
  },
  component: MealPlanRoute,
  pendingComponent: () => <Spinner />,
});

function MealPlanRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const range = rangeFor(searchParams.from, searchParams.weeks);

  const { data: plan } = useSuspenseQuery(mealPlanRangeQueryOptions(range));
  const days = toDaysWithMeals(plan);
  const { data: recipes } = useSuspenseQuery(listRecipeOptionsQueryOptions({ sortDirection: 'asc', sortKey: 'title' }));
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const members = eligibleMembers(household?.members ?? []);
  const visibleDays = days.map((day) => day.day);

  const { moveMeal, onDragEnd } = useMealMove(range, days);

  const searchFor = (from: string, weeks: SearchParams['weeks']) => ({ from, weeks });

  return (
    <>
      <Actionbar.Content>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Meal plan</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">Meal plan</h1>
            <p className="text-muted-foreground text-sm">
              Lunch for the week ahead — pick a recipe, write in whatever isn't one, and say who's eating what.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Real links, so paging through weeks builds history the back button can walk. */}
            <ButtonGroup>
              <Button aria-label="Previous weeks" asChild size="icon" variant="outline">
                <Link search={searchFor(shiftWeeks(searchParams.from, -searchParams.weeks), searchParams.weeks)} to=".">
                  <ChevronLeftIcon />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link search={searchFor(currentWeekStart(), searchParams.weeks)} to=".">
                  Today
                </Link>
              </Button>
              <Button aria-label="Next weeks" asChild size="icon" variant="outline">
                <Link search={searchFor(shiftWeeks(searchParams.from, searchParams.weeks), searchParams.weeks)} to=".">
                  <ChevronRightIcon />
                </Link>
              </Button>
            </ButtonGroup>

            <Select
              onValueChange={(value) =>
                navigate({ search: searchFor(searchParams.from, Number(value) as SearchParams['weeks']), to: '.' })
              }
              value={String(searchParams.weeks)}
            >
              <SelectTrigger aria-label="Weeks shown" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 week</SelectItem>
                <SelectItem value="2">2 weeks</SelectItem>
                <SelectItem value="4">4 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DragDropProvider onDragEnd={onDragEnd}>
          {/* Cards only — the title and week nav stay full-bleed, as on every other list page. */}
          <div className="space-y-6 lg:max-w-2/3">
            {groupIntoWeeks(days).map((week) => (
              <section className="space-y-2" key={week.start}>
                <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {rangeLabel(week.start, week.end)}
                </h2>
                <div className="space-y-2">
                  {week.days.map((day) => (
                    <MealPlanDayRow
                      day={day}
                      key={day.day}
                      members={members}
                      onMoveMeal={(id, toDay) => moveMeal({ id, toDay })}
                      recipes={recipes}
                      visibleDays={visibleDays}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DragDropProvider>
      </PageLayout>
    </>
  );
}
