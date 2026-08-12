import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, CookingPotIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Button, Skeleton } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import {
  currentWeekStart,
  dayLabel,
  isToday,
  mealPlanRangeQueryOptions,
  rangeFor,
  toDaysWithMeals,
  weekdayLabel,
} from '@/modules/meal-plan';
import { daysOfWeek } from '@/modules/shared';

import { DashboardCard, type DashboardCardFrame } from './dashboard-card';

/** Spelled exactly as `/food/meal-plan` spells its default view, so the two share one cache entry. */
export const weekMealsQueryOptions = () => mealPlanRangeQueryOptions(rangeFor(currentWeekStart(), 1));

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  action: (
    <Button asChild size="sm" variant="ghost">
      <Link to="/food/meal-plan">
        Plan the week
        <ArrowRightIcon />
      </Link>
    </Button>
  ),
  className: 'md:col-span-2',
  icon: CookingPotIcon,
  title: "This week's meals",
} satisfies DashboardCardFrame;

function WeekStrip({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-7">{children}</div>;
}

/** A day's column. Which days they are is local date maths, so it renders before any meal arrives. */
function Day({ children, day }: { children: ReactNode; day: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border p-2', isToday(day) && 'border-primary/50 bg-primary/5')}>
      <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:gap-0">
        <span className="font-medium text-xs">
          <span className="sm:hidden">{weekdayLabel(day)}</span>
          <span className="hidden sm:inline">{weekdayLabel(day).slice(0, 3)}</span>
        </span>
        <span className="text-muted-foreground text-xs">{dayLabel(day)}</span>
      </div>
      {children}
    </div>
  );
}

function WeekMealsCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <WeekStrip>
        {daysOfWeek(currentWeekStart()).map((day) => (
          <Day day={day} key={day}>
            <Skeleton className="h-4 w-full" />
          </Day>
        ))}
      </WeekStrip>
    </DashboardCard>
  );
}

export function WeekMealsCard() {
  const { data: range } = useSuspenseQuery(weekMealsQueryOptions());
  const days = toDaysWithMeals(range);

  return (
    <DashboardCard {...CARD}>
      <WeekStrip>
        {days.map((day) => (
          <Day day={day.day} key={day.day}>
            {day.meals.length === 0 ? (
              <span className="text-muted-foreground text-sm">—</span>
            ) : (
              day.meals.map((meal) => (
                <span className="text-sm leading-snug" key={meal.id}>
                  {meal.label}
                </span>
              ))
            )}
            {day.note ? <span className="text-muted-foreground text-xs italic">{day.note}</span> : null}
          </Day>
        ))}
      </WeekStrip>
    </DashboardCard>
  );
}

WeekMealsCard.Skeleton = WeekMealsCardSkeleton;
