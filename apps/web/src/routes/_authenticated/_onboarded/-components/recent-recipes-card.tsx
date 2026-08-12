import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ClockIcon, ScrollTextIcon } from 'lucide-react';

import { Button, Skeleton } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { listRecipesQueryOptions, mealTypeLabels } from '@/modules/recipes';
import { formatMinutes } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty, type DashboardCardFrame } from './dashboard-card';

/** A row of four on a wide screen, and the newest four are the ones anyone is still thinking about. */
const SHOWN = 4;

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  action: (
    <Button asChild size="sm" variant="ghost">
      <Link to="/food/recipes">
        View all
        <ArrowRightIcon />
      </Link>
    </Button>
  ),
  className: 'md:col-span-2',
  icon: ScrollTextIcon,
  title: 'Recently added recipes',
} satisfies DashboardCardFrame;

/** The newest recipes. `includeArchived` defaults to `false` on the endpoint. */
export const dashboardRecentRecipesQueryOptions = () =>
  listRecipesQueryOptions({ sortDirection: 'desc', sortKey: 'createdAt' });

/** Uneven, so the placeholder reads as a row of titles. Also the tile keys. */
const TILE_WIDTHS = ['w-32', 'w-24', 'w-28', 'w-20'];

function RecentRecipesCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TILE_WIDTHS.slice(0, SHOWN).map((width) => (
          <div className="space-y-2 rounded-lg border p-3" key={width}>
            <Skeleton className={cn('h-4 max-w-full', width)} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

export function RecentRecipesCard() {
  const { data: recipes } = useSuspenseQuery(dashboardRecentRecipesQueryOptions());

  const recent = recipes.slice(0, SHOWN);

  return (
    <DashboardCard {...CARD}>
      {recent.length === 0 ? (
        <DashboardCardEmpty>No recipes yet.</DashboardCardEmpty>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {recent.map((recipe) => {
            const totalTime = formatMinutes((recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0));

            return (
              <Link
                className="rounded-lg border p-3 transition-colors hover:border-primary/50"
                key={recipe.id}
                params={{ recipeId: String(recipe.id) }}
                to="/food/recipes/$recipeId"
              >
                <p className="truncate font-medium text-sm">{recipe.title}</p>
                <p className="flex items-center gap-2 text-muted-foreground text-xs">
                  {recipe.mealType ? <span>{mealTypeLabels[recipe.mealType]}</span> : null}
                  {totalTime ? (
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {totalTime}
                    </span>
                  ) : null}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

RecentRecipesCard.Skeleton = RecentRecipesCardSkeleton;
