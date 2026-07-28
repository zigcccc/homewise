import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Spinner,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { invalidateIngredients, listIngredientsQueryOptions } from '@/modules/ingredients';
import { invalidateRecipes, listRecipeTagsQueryOptions, RecipeForm, type RecipeFormValues } from '@/modules/recipes';
import { Actionbar } from '@/modules/shared';

const $createRecipe = client.recipes.$post;

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/new')({
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listIngredientsQueryOptions()),
      context.queryClient.ensureQueryData(listRecipeTagsQueryOptions()),
    ]);
  },
  component: NewRecipeRoute,
  pendingComponent: () => <Spinner />,
});

function NewRecipeRoute() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const { data: ingredients } = useSuspenseQuery(listIngredientsQueryOptions());
  const { data: tags } = useSuspenseQuery(listRecipeTagsQueryOptions());

  const { mutateAsync: createRecipe } = useMutation({
    mutationFn: async (json: RecipeFormValues) => parseResponse($createRecipe({ json })),
  });

  const handleSubmit = async (values: RecipeFormValues) => {
    try {
      const recipe = await createRecipe(values);
      toast.success(`"${recipe.title}" saved.`);
      await navigate({ to: '/food/recipes/$recipeId', params: { recipeId: recipe.id.toString() } });
      invalidateRecipes(queryClient);
      // Saving is also when any ingredient named on the form gets created, so the library is stale.
      invalidateIngredients(queryClient);
    } catch {
      toast.error('Something went wrong.');
      // Rethrow so the form stays put with the user's input intact.
      throw new Error('create failed');
    }
  };

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
              <BreadcrumbLink asChild>
                <Link to="/food/recipes">Recipes</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-4 p-4">
        <div>
          <h1 className="font-medium text-lg">Add a recipe</h1>
          <p className="text-muted-foreground text-sm">Only the title is required — fill in the rest as you go.</p>
        </div>

        <RecipeForm
          cancelTo={
            <Button asChild variant="outline">
              <Link to="/food/recipes">Cancel</Link>
            </Button>
          }
          ingredients={ingredients}
          onSubmit={handleSubmit}
          submitLabel="Save recipe"
          tagSuggestions={tags.map((tag) => tag.name)}
        />
      </main>
    </>
  );
}
