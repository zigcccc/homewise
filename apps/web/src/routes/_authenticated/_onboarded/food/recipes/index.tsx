import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ClockIcon, PlusIcon, ScrollTextIcon, StarIcon } from 'lucide-react';
import z from 'zod';

import { pagedQueryParams, searchQueryParam, sortDirection } from '@homewise/server/models';
import { mealType, recipeSortKey } from '@homewise/server/recipes';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
} from '@homewise/ui/core';

import { listRecipesQueryOptions, listRecipeTagsQueryOptions, mealTypeLabels } from '@/modules/recipes';
import {
  Actionbar,
  formatMinutes,
  ListPagination,
  PageLayout,
  SELECT_ALL,
  SearchInput,
  SORT_LABELS,
  type SortDirectionLabels,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';

const searchParamsModel = z.object({
  search: searchQueryParam,
  mealType: mealType.optional().catch(undefined),
  tagId: z.number().optional().catch(undefined),
  favoritesOnly: z.boolean().default(false).catch(false),
  includeArchived: z.boolean().default(false).catch(false),
  sortKey: recipeSortKey.default('title').catch('title'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams.shape,
});

type SearchParams = z.infer<typeof searchParamsModel>;

const sortKeyLabels: Record<z.infer<typeof recipeSortKey>, string> = {
  title: 'Title',
  createdAt: 'Date added',
  updatedAt: 'Last updated',
};

/** Ascending reads differently per column: A → Z for a title, oldest-first for a date. */
const sortDirectionLabels: Record<z.infer<typeof recipeSortKey>, SortDirectionLabels> = {
  title: SORT_LABELS.text,
  createdAt: SORT_LABELS.date,
  updatedAt: SORT_LABELS.date,
};

/** Search params are typed; the RPC query string wants strings. */
function toQuery(search: SearchParams) {
  return {
    search: search.search,
    mealType: search.mealType,
    // `z.coerce.number()` on the server makes the RPC query type a number, not a string.
    tagId: search.tagId,
    favoritesOnly: search.favoritesOnly ? 'true' : 'false',
    includeArchived: search.includeArchived ? 'true' : 'false',
    sortKey: search.sortKey,
    sortDirection: search.sortDirection,
    page: search.page,
    pageSize: search.pageSize,
  };
}

export const Route = createFileRoute('/_authenticated/_onboarded/food/recipes/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listRecipesQueryOptions(toQuery(deps))),
      context.queryClient.ensureQueryData(listRecipeTagsQueryOptions()),
    ]);
  },
  component: RecipesRoute,
  pendingComponent: () => <Spinner />,
});

function RecipesRoute() {
  const searchParams = Route.useSearch();

  const { data: recipesPage } = useSuspenseQuery(listRecipesQueryOptions(toQuery(searchParams)));
  const recipes = recipesPage.items;
  const { data: tags } = useSuspenseQuery(listRecipeTagsQueryOptions());

  const setSearchParam = useSearchParamSetter(Route);

  const isFiltered = Boolean(
    searchParams.search || searchParams.mealType || searchParams.tagId || searchParams.favoritesOnly
  );

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
              <BreadcrumbPage>Recipes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">Recipes</h1>
            <p className="text-muted-foreground text-sm">
              Everything you cook, in one place — searchable by name or by what's in it.
            </p>
          </div>
          <Button asChild>
            <Link to="/food/recipes/new">
              <PlusIcon />
              Add recipe
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Search recipes"
            onChange={(next) => setSearchParam('search', next, { replace: true })}
            placeholder="Search recipes or ingredients"
            value={searchParams.search}
          />

          <Select
            onValueChange={(value) => setSearchParam('mealType', value === SELECT_ALL ? undefined : (value as never))}
            value={searchParams.mealType ?? SELECT_ALL}
          >
            <SelectTrigger className="w-44">
              <span>{searchParams.mealType ? mealTypeLabels[searchParams.mealType] : 'Any meal'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_ALL}>Any meal</SelectItem>
              {mealType.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {mealTypeLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tags.length > 0 && (
            <Select
              onValueChange={(value) => setSearchParam('tagId', value === SELECT_ALL ? undefined : Number(value))}
              value={searchParams.tagId?.toString() ?? SELECT_ALL}
            >
              <SelectTrigger className="w-44">
                <span>{tags.find((tag) => tag.id === searchParams.tagId)?.name ?? 'Any tag'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL}>Any tag</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select onValueChange={(value) => setSearchParam('sortKey', value as never)} value={searchParams.sortKey}>
            <SelectTrigger className="w-48">
              <span>
                Sort by: <span className="font-medium">{sortKeyLabels[searchParams.sortKey]}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {recipeSortKey.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {sortKeyLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SortDirectionToggle
            labels={sortDirectionLabels[searchParams.sortKey]}
            onChange={(next) => setSearchParam('sortDirection', next)}
            value={searchParams.sortDirection}
          />

          <Label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={searchParams.favoritesOnly}
              onCheckedChange={(checked) => setSearchParam('favoritesOnly', checked === true)}
            />
            Favorites
          </Label>

          <Label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={searchParams.includeArchived}
              onCheckedChange={(checked) => setSearchParam('includeArchived', checked === true)}
            />
            Show archived
          </Label>
        </div>

        {recipes.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollTextIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No matching recipes' : 'No recipes yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try a different search term or clear the filters.'
                  : 'Write down the first one — the notes app, the screenshots, the card in the drawer.'}
              </EmptyDescription>
            </EmptyHeader>
            {!isFiltered && (
              <EmptyContent>
                <Button asChild>
                  <Link to="/food/recipes/new">
                    <PlusIcon />
                    Add recipe
                  </Link>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => {
              const totalTime = formatMinutes((recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0));

              return (
                <Link key={recipe.id} params={{ recipeId: recipe.id.toString() }} to="/food/recipes/$recipeId">
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardHeader>
                      <CardTitle className="flex items-start gap-2">
                        <span className="flex-1">{recipe.title}</span>
                        {recipe.isFavorite && (
                          <StarIcon aria-label="Favorite" className="size-4 shrink-0 fill-current text-amber-500" />
                        )}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {recipe.description || (recipe.cuisine ?? 'No description')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-muted-foreground text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {recipe.mealType && <span>{mealTypeLabels[recipe.mealType]}</span>}
                        {totalTime && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="size-3.5" />
                            {totalTime}
                          </span>
                        )}
                        <span>
                          {recipe.ingredientCount} {recipe.ingredientCount === 1 ? 'ingredient' : 'ingredients'}
                        </span>
                      </div>
                      {recipe.archived && <span className="font-medium text-xs uppercase">Archived</span>}
                      {recipe.tags.length > 0 && (
                        <ul className="flex flex-wrap gap-1">
                          {recipe.tags.map((tag) => (
                            <li className="rounded-full bg-muted px-2 py-0.5 text-xs" key={tag.id}>
                              {tag.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <ListPagination page={recipesPage} setSearchParam={setSearchParam} />
      </PageLayout>
    </>
  );
}
