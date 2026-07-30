import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontal, PencilIcon, StarIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { getRecipeQueryOptions, invalidateRecipe, invalidateRecipes } from '@/modules/recipes';
import { Actionbar, ConfirmDeleteDialog } from '@/modules/shared';

const $patchRecipe = client.recipes[':id'].$patch;
const $deleteRecipe = client.recipes[':id'].$delete;

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/$recipeId')({
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getRecipeQueryOptions(Number(params.recipeId)));
  },
  component: RecipeLayout,
  pendingComponent: () => <Spinner />,
});

function RecipeLayout() {
  const { recipeId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const matchRoute = useMatchRoute();
  const id = Number(recipeId);

  // This header belongs to the layout, so it also renders over the edit form — where an "Edit"
  // button links to the page you're already on. The form owns its own save/cancel footer.
  const isEditing = Boolean(matchRoute({ to: '/food/recipes/$recipeId/edit' }));

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: recipe } = useSuspenseQuery(getRecipeQueryOptions(id));

  const { mutateAsync: patchRecipe } = useMutation({
    mutationFn: async (json: { archived?: boolean; isFavorite?: boolean }) =>
      parseResponse($patchRecipe({ param: { id: id.toString() }, json })),
  });

  const { mutateAsync: deleteRecipe } = useMutation({
    mutationFn: async () => parseResponse($deleteRecipe({ param: { id: id.toString() } })),
  });

  const handleToggleFavorite = async () => {
    try {
      await patchRecipe({ isFavorite: !recipe.isFavorite });
      toast.success(recipe.isFavorite ? 'Removed from favorites.' : 'Added to favorites.');
      invalidateRecipe(queryClient, id);
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const handleToggleArchived = async () => {
    try {
      await patchRecipe({ archived: !recipe.archived });
      toast.success(recipe.archived ? 'Recipe restored.' : 'Recipe archived.');
      invalidateRecipe(queryClient, id);
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRecipe();
      toast.success(`"${recipe.title}" deleted.`);
      await navigate({ to: '/food/recipes' });
      // After navigating away, so the removed recipe's detail query can't refetch into a 404.
      invalidateRecipes(queryClient);
    } catch {
      toast.error('Something went wrong.');
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
              <BreadcrumbPage>{recipe.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-medium text-lg">
              {recipe.title}
              {recipe.isFavorite && <StarIcon aria-label="Favorite" className="size-4 fill-current text-amber-500" />}
            </h1>
            <p className="text-muted-foreground text-sm">
              {recipe.archived ? 'Archived recipe' : (recipe.description ?? 'Recipe')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isEditing && (
              <Button asChild variant="outline">
                <Link params={{ recipeId }} to="/food/recipes/$recipeId/edit">
                  <PencilIcon />
                  Edit
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 w-9 p-0" variant="outline">
                  <span className="sr-only">Recipe actions</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void handleToggleFavorite()}>
                  <StarIcon />
                  {recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleToggleArchived()}>
                  {recipe.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {recipe.archived ? 'Restore recipe' : 'Archive recipe'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                  <TrashIcon />
                  Delete recipe
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Outlet />

        <ConfirmDeleteDialog
          confirmLabel="Delete recipe"
          description={
            <>
              "{recipe.title}" and its ingredients and steps will be permanently deleted. This can't be undone — if you
              just want it out of the way, archive it instead.
            </>
          }
          onConfirm={handleDelete}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title={`Delete "${recipe.title}"?`}
        />
      </main>
    </>
  );
}
