import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ClockIcon, ScrollTextIcon } from 'lucide-react';

import { Button } from '@homewise/ui/core';

import { listRecipesQueryOptions, mealTypeLabels } from '@/modules/recipes';
import { formatMinutes } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty } from './dashboard-card';

/** A row of four on a wide screen, and the newest four are the ones anyone is still thinking about. */
const SHOWN = 4;

/** The newest recipes. `includeArchived` defaults to `false` on the endpoint. */
export const dashboardRecentRecipesQueryOptions = () =>
  listRecipesQueryOptions({ sortDirection: 'desc', sortKey: 'createdAt' });

export function RecentRecipesCard() {
  const { data: recipes } = useSuspenseQuery(dashboardRecentRecipesQueryOptions());

  const recent = recipes.slice(0, SHOWN);

  return (
    <DashboardCard
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/food/recipes">
            View all
            <ArrowRightIcon />
          </Link>
        </Button>
      }
      className="md:col-span-2"
      icon={ScrollTextIcon}
      title="Recently added recipes"
    >
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
