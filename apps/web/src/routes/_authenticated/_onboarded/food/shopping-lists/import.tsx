import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { addDays, format } from 'date-fns';
import { CalendarOffIcon, ChevronLeftIcon } from 'lucide-react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { IMPORT_DEFAULT_DAYS, importFromMealPlanModel } from '@homewise/server/shopping-lists';
import {
  Button,
  Checkbox,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Label,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { formatQuantity } from '@/modules/ingredients';
import { DateField, serverMessage } from '@/modules/shared';
import {
  $importFromMealPlan,
  invalidateShoppingLists,
  type MealPlanPreview,
  type MealPlanPreviewLine,
  mealPlanPreviewQueryOptions,
} from '@/modules/shopping-lists';

const today = () => format(new Date(), 'yyyy-MM-dd');

const searchParamsModel = z.object({
  /**
   * Both defaulted rather than `.catch()`-ed to a fixed value: `.catch(today())` would freeze the
   * date at the moment the chunk was evaluated, the same trap the meal plan documents.
   */
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  /** Which list the items land on — a new one, or the id of an existing one. */
  target: z
    .union([z.literal('new'), z.number().int().positive()])
    .default('new')
    .catch('new'),
});

/** The range actually used, once the optional params are filled in. */
function rangeFor(search: { from?: string; to?: string }) {
  const from = search.from ?? today();

  return { from, to: search.to ?? format(addDays(new Date(from), IMPORT_DEFAULT_DAYS - 1), 'yyyy-MM-dd') };
}

const importLineModel = importFromMealPlanModel.shape.lines.element;

/**
 * What you tick, plus the payload each row would contribute.
 *
 * Built out of the endpoint's own line model rather than beside it, so the amounts this screen sends
 * are validated by the same schema that will receive them. `scaledAmounts` reuses that model's
 * `amounts` shape for the same reason — the toggle chooses between two sets of the same thing.
 */
const importFormModel = z.object({
  lines: z.array(importLineModel.extend({ include: z.boolean(), scaledAmounts: importLineModel.shape.amounts })),
  /** Off buys what the recipes are written for, however many people the meals are actually for. */
  scale: z.boolean(),
});
type ImportFormValues = z.infer<typeof importFormModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists/import')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => rangeFor(search),
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(mealPlanPreviewQueryOptions(deps));
  },
  component: ImportRoute,
  pendingComponent: () => <Spinner />,
});

/**
 * Turns a stretch of the meal plan into things to buy.
 *
 * A preview rather than a straight import: not every planned meal is one you shop for, and half the
 * ingredients are already in the cupboard. Everything starts ticked, so the common case is one
 * click, and untick what you already have.
 */
function ImportRoute() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();

  const range = rangeFor(searchParams);
  const { data: preview } = useSuspenseQuery(mealPlanPreviewQueryOptions(range));

  const setRange = (key: 'from' | 'to', value: string) =>
    navigate({ search: { ...searchParams, [key]: value || undefined }, to: '.' });

  return (
    <div className="space-y-4">
      {/* The master column is off-screen under `md`, so this is the only way back to it. */}
      <Link className="flex items-center gap-1 text-muted-foreground text-sm md:hidden" to="/food/shopping-lists">
        <ChevronLeftIcon className="size-4" />
        All lists
      </Link>

      <div>
        <h2 className="font-medium text-lg">From the meal plan</h2>
        <p className="text-muted-foreground text-sm">
          Everything the recipes planned in this range call for, added up.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="import-from">From</Label>
          <DateField allowFuture id="import-from" onChange={(value) => setRange('from', value)} value={range.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-to">To</Label>
          <DateField allowFuture id="import-to" onChange={(value) => setRange('to', value)} value={range.to} />
        </div>
      </div>

      {preview.lines.length === 0 ? (
        // Two different problems with two different fixes: plan something, or attach a recipe to
        // what's already planned. Saying "either/or" would leave the reader to work out which.
        <Empty className="min-h-64">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarOffIcon />
            </EmptyMedia>
            {preview.plannedMeals === 0 ? (
              <>
                <EmptyTitle>Nothing planned for these days</EmptyTitle>
                <EmptyDescription>Plan some meals in this range, and their ingredients land here.</EmptyDescription>
              </>
            ) : (
              <>
                <EmptyTitle>Nothing to buy for these days</EmptyTitle>
                <EmptyDescription>
                  {preview.plannedMeals === 1 ? 'The meal' : `All ${preview.plannedMeals} meals`} planned here{' '}
                  {preview.plannedMeals === 1 ? 'has' : 'have'} no recipe attached, and a free-text meal names no
                  ingredients.
                </EmptyDescription>
              </>
            )}
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/food/meal-plan">Open the meal plan</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        // Remounted when the range moves: the preview is loader data and `defaultValues` don't follow
        // it, so without a new key the form keeps holding the previous range's lines.
        <ImportForm key={`${range.from}:${range.to}`} preview={preview} target={searchParams.target} />
      )}
    </div>
  );
}

/** "Garlic Butter Pasta (2 of 8)" — where the amount beside it came from, when it isn't as written. */
function recipeLabel(recipe: MealPlanPreviewLine['recipes'][number], scaled: boolean) {
  return scaled && recipe.servings ? `${recipe.title} (${recipe.eaters} of ${recipe.servings})` : recipe.title;
}

function ImportForm({ preview, target }: { preview: MealPlanPreview; target: 'new' | number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormModel),
    defaultValues: {
      lines: preview.lines.map((line) => ({
        amounts: line.amounts,
        include: true,
        ingredientId: line.ingredientId,
        scaledAmounts: line.scaledAmounts,
      })),
      scale: true,
    },
  });

  const [lines, scale] = form.watch(['lines', 'scale']);
  const picked = lines.filter((line) => line.include);

  const { mutateAsync: runImport, isPending } = useMutation({
    mutationFn: async (values: ImportFormValues) =>
      parseResponse(
        $importFromMealPlan({
          json: {
            listId: target === 'new' ? undefined : target,
            lines: values.lines
              .filter((line) => line.include)
              .map((line) => ({
                amounts: values.scale ? line.scaledAmounts : line.amounts,
                ingredientId: line.ingredientId,
              })),
          },
        })
      ),
  });

  const handleImport: SubmitHandler<ImportFormValues> = async (values) => {
    try {
      const list = await runImport(values);
      toast.success(picked.length === 1 ? '1 item added.' : `${picked.length} items added.`);
      invalidateShoppingLists(queryClient);
      await navigate({ params: { listId: list.id.toString() }, to: '/food/shopping-lists/$listId' });
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(handleImport)}>
        <FormField
          control={form.control}
          name="scale"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <FormLabel className="font-normal text-sm">Scale to who's eating</FormLabel>
            </FormItem>
          )}
        />

        <ul className="divide-y rounded-md border">
          {preview.lines.map((line, index) => (
            <li className="flex items-center gap-3 px-3 py-2" key={line.ingredientId}>
              <FormField
                control={form.control}
                name={`lines.${index}.include`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Checkbox
                        aria-label={`Include ${line.name}`}
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 truncate">{line.name}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {(scale ? line.scaledAmounts : line.amounts)
                      .map((amount) => formatQuantity(amount.quantity, amount.unit))
                      .join(', ')}
                  </span>
                </span>
                <p className="text-muted-foreground text-xs">
                  {line.store ? `${line.store.name} · ` : ''}
                  {line.recipes.length === 1 ? recipeLabel(line.recipes[0]!, scale) : `${line.recipes.length} recipes`}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button disabled={picked.length === 0} loading={isPending} type="submit">
            {picked.length === 1 ? 'Add 1 item' : `Add ${picked.length} items`}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/food/shopping-lists">Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  );
}
