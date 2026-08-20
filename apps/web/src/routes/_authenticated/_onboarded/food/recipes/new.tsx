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
import { invalidateIngredients } from '@/modules/ingredients';
import { invalidateRecipes, listRecipeTagsQueryOptions, RecipeForm, type RecipeFormValues } from '@/modules/recipes';
import { Actionbar, PageLayout, RouteError, requireWrite, serverMessage } from '@/modules/shared';

const $createRecipe = client.recipes.$post;

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/new')({
  beforeLoad({ context }) {
    requireWrite(context.role, 'recipes');
  },
  async loader({ context }) {
    await context.queryClient.ensureQueryData(listRecipeTagsQueryOptions());
  },
  component: NewRecipeRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load the recipe form" />,
});

function NewRecipeRoute() {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

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
    } catch (error) {
      // Prefer the server's own reason — a duplicate ingredient name or a rejected field says far
      // more than "Something went wrong."
      toast.error(serverMessage(error, 'Something went wrong.'));
      // Rethrow the original so the form stays put with the user's input intact, and so anything
      // upstream still sees the real cause.
      throw error;
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

      <PageLayout className="space-y-4">
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
          onSubmit={handleSubmit}
          submitLabel="Save recipe"
          tagSuggestions={tags.map((tag) => tag.name)}
        />
      </PageLayout>
    </>
  );
}
