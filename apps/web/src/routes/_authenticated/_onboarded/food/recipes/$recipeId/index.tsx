import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ClockIcon, ExternalLinkIcon, MinusIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@homewise/ui/core';

import { formatQuantity } from '@/modules/ingredients';
import {
  formatMinutes,
  formatSource,
  getRecipeQueryOptions,
  mealTypeLabels,
  type RecipeDetail,
} from '@/modules/recipes';

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/$recipeId/')({
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getRecipeQueryOptions(Number(params.recipeId)));
  },
  component: RecipeDetailRoute,
  pendingComponent: () => <Spinner />,
});

/** Groups the ingredient lines under their section heading, preserving the saved order. */
function groupBySection(ingredients: RecipeDetail['ingredients']) {
  const groups: { section: string | null; lines: RecipeDetail['ingredients'] }[] = [];

  for (const line of ingredients) {
    const last = groups.at(-1);

    if (last && last.section === line.section) {
      last.lines.push(line);
    } else {
      groups.push({ section: line.section, lines: [line] });
    }
  }

  return groups;
}

function RecipeDetailRoute() {
  const { recipeId } = Route.useParams();
  const { data: recipe } = useSuspenseQuery(getRecipeQueryOptions(Number(recipeId)));

  // Transient view state — how many people you're cooking for right now, not a property of the recipe.
  const [servings, setServings] = useState(recipe.servings);

  const scale = recipe.servings && servings ? servings / recipe.servings : 1;
  const totalTime = formatMinutes((recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0));
  const source = formatSource(recipe.sourceName, recipe.sourceUrl);
  const groups = groupBySection(recipe.ingredients);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
        {recipe.mealType && <span>{mealTypeLabels[recipe.mealType]}</span>}
        {recipe.cuisine && <span>{recipe.cuisine}</span>}
        {formatMinutes(recipe.prepTimeMinutes) && <span>Prep {formatMinutes(recipe.prepTimeMinutes)}</span>}
        {formatMinutes(recipe.cookTimeMinutes) && <span>Cook {formatMinutes(recipe.cookTimeMinutes)}</span>}
        {totalTime && (
          <span className="flex items-center gap-1 font-medium text-foreground">
            <ClockIcon className="size-3.5" />
            {totalTime} total
          </span>
        )}
        {/* Where it came from is attribution, not a section of the recipe — it belongs on this line
            with the rest of the metadata rather than in a card of its own below the method. */}
        {source &&
          (recipe.sourceUrl ? (
            <a
              className="flex items-center gap-1 hover:text-foreground hover:underline"
              href={recipe.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {source}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : (
            <span>{source}</span>
          ))}
      </div>

      {recipe.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {recipe.tags.map((tag) => (
            <li className="rounded-full bg-muted px-2 py-0.5 text-xs" key={tag.id}>
              {tag.name}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Ingredients
              {recipe.servings !== null && servings !== null && (
                <span className="flex items-center gap-1">
                  <Button
                    aria-label="Fewer servings"
                    disabled={servings <= 1}
                    onClick={() => setServings(servings - 1)}
                    size="icon"
                    variant="outline"
                  >
                    <MinusIcon />
                  </Button>
                  <span className="flex min-w-20 items-center justify-center gap-1 font-normal text-sm">
                    <UsersIcon className="size-3.5" />
                    <span data-testid="servings">{servings}</span>
                  </span>
                  <Button
                    aria-label="More servings"
                    disabled={servings >= 100}
                    onClick={() => setServings(servings + 1)}
                    size="icon"
                    variant="outline"
                  >
                    <PlusIcon />
                  </Button>
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="recipe-ingredients">
            {recipe.ingredients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No ingredients listed yet.</p>
            ) : (
              <div className="space-y-4">
                {/* Keyed by index too: groupBySection only merges *adjacent* lines, so "For the
                    dough / For the sauce / For the dough" legitimately yields two same-named groups. */}
                {groups.map((group, groupIndex) => (
                  <div key={`${groupIndex}-${group.section ?? '__none'}`}>
                    {group.section && <h3 className="mb-1 font-medium text-sm">{group.section}</h3>}
                    <ul className="space-y-1">
                      {group.lines.map((line) => (
                        <li className="flex justify-between gap-3 text-sm" key={line.id}>
                          <span>
                            {line.ingredient.name}
                            {line.note && <span className="text-muted-foreground"> — {line.note}</span>}
                          </span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {formatQuantity(line.quantity === null ? null : line.quantity * scale, line.unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent data-testid="recipe-steps">
            {recipe.steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">No steps written down yet.</p>
            ) : (
              <ol className="space-y-3">
                {recipe.steps.map((step, index) => (
                  <li className="flex gap-3" key={step.id}>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-relaxed">{step.instruction}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
