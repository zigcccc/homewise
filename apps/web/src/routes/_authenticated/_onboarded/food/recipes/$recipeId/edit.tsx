import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Button, Spinner } from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { invalidateIngredients } from '@/modules/ingredients';
import {
  getRecipeQueryOptions,
  invalidateRecipe,
  listRecipeTagsQueryOptions,
  RecipeForm,
  type RecipeFormValues,
} from '@/modules/recipes';
import { RouteError, serverMessage } from '@/modules/shared';

const $patchRecipe = client.recipes[':id'].$patch;

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/$recipeId/edit')({
  async loader({ context, params }) {
    await Promise.all([
      context.queryClient.ensureQueryData(getRecipeQueryOptions(Number(params.recipeId))),
      context.queryClient.ensureQueryData(listRecipeTagsQueryOptions()),
    ]);
  },
  component: EditRecipeRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load this recipe" />,
});

function EditRecipeRoute() {
  const { recipeId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const id = Number(recipeId);

  const { data: recipe } = useSuspenseQuery(getRecipeQueryOptions(id));
  const { data: tags } = useSuspenseQuery(listRecipeTagsQueryOptions());

  const { mutateAsync: patchRecipe } = useMutation({
    mutationFn: async (json: RecipeFormValues) => parseResponse($patchRecipe({ param: { id: id.toString() }, json })),
  });

  const handleSubmit = async (values: RecipeFormValues) => {
    try {
      await patchRecipe(values);
      toast.success('Recipe updated.');
      invalidateRecipe(queryClient, id);
      // Saving is also when any ingredient named on the form gets created, so the library is stale.
      invalidateIngredients(queryClient);
      await navigate({ to: '/food/recipes/$recipeId', params: { recipeId } });
    } catch (error) {
      // Prefer the server's own reason — a duplicate ingredient name or a rejected field says far
      // more than "Something went wrong."
      toast.error(serverMessage(error, 'Something went wrong.'));
      // Rethrow the original so the form stays put with the user's edits intact, and so anything
      // upstream still sees the real cause.
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <RecipeForm
        cancelTo={
          <Button asChild variant="outline">
            <Link params={{ recipeId }} to="/food/recipes/$recipeId">
              Cancel
            </Link>
          </Button>
        }
        onSubmit={handleSubmit}
        recipe={recipe}
        submitLabel="Save changes"
        tagSuggestions={tags.map((tag) => tag.name)}
      />
    </div>
  );
}
