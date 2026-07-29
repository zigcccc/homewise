import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ClockIcon, ExternalLinkIcon, MinusIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useMemo } from 'react';
import z from 'zod';

import { Button, Card, CardContent, CardHeader, CardTitle, Spinner } from '@homewise/ui/core';

import { formatQuantity } from '@/modules/ingredients';
import { getRecipeQueryOptions, groupBySection, mealTypeLabels } from '@/modules/recipes';
import { ExternalLink, formatMinutes, formatSource } from '@/modules/shared';

/** The cap the stepper enforces, so a hand-edited URL can't scale a recipe past what the UI allows. */
const MAX_SERVINGS = 100;

const searchParamsModel = z.object({
  /**
   * How many people you're cooking for right now — a view of the recipe, not a property of it. It
   * lives in the URL so the scaled amounts survive a refresh and can be sent to whoever is cooking.
   * Absent means "as written", which is why there's no default: the recipe's own serving count is
   * the fallback, and it isn't known until the loader has run.
   */
  servings: z.number().int().positive().max(MAX_SERVINGS).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/$recipeId/')({
  validateSearch: searchParamsModel,
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getRecipeQueryOptions(Number(params.recipeId)));
  },
  component: RecipeDetailRoute,
  pendingComponent: () => <Spinner />,
});

function RecipeDetailRoute() {
  const { recipeId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: recipe } = useSuspenseQuery(getRecipeQueryOptions(Number(recipeId)));

  const servings = searchParams.servings ?? recipe.servings;
  // `replace` on purpose: stepping from 2 to 8 is one adjustment, not six pages to walk back through.
  const setServings = (value: number) => navigate({ replace: true, search: { servings: value }, to: '.' });

  const scale = recipe.servings && servings ? servings / recipe.servings : 1;
  const totalTime = formatMinutes((recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0));
  const source = formatSource(recipe.sourceName, recipe.sourceUrl);
  const groups = useMemo(() => groupBySection(recipe.ingredients), [recipe.ingredients]);

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
            <ExternalLink
              className="flex items-center gap-1 hover:text-foreground hover:underline"
              href={recipe.sourceUrl}
            >
              {source}
              <ExternalLinkIcon className="size-3.5" />
            </ExternalLink>
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
                    disabled={servings >= MAX_SERVINGS}
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
