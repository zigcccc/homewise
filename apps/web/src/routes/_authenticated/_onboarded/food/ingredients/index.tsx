import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { CarrotIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { ingredientCategory, ingredientSortKey } from '@homewise/server/ingredients';
import { pagedQueryParams, searchQueryParam, sortDirection } from '@homewise/server/models';
import {
  Button,
  DataTable,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import {
  IngredientCategorySelectItems,
  IngredientFormDialog,
  ingredientCategoryLabels,
  listIngredientsQueryOptions,
} from '@/modules/ingredients';
import {
  Can,
  ListPagination,
  RouteError,
  SELECT_ALL,
  SELECT_NONE,
  SearchInput,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';
import { listStoreOptionsQueryOptions, StoreSelectItems } from '@/modules/stores';

import { ingredientsTableColumns } from './-ingredients-table.config';

const searchParamsModel = z.object({
  search: searchQueryParam,
  category: ingredientCategory.optional().catch(undefined),
  /** A shop id, or `none` for the ingredients with no shop assigned yet. */
  store: z
    .union([z.literal(SELECT_NONE), z.number().int().positive()])
    .optional()
    .catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams().shape,
});

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    // The shop filter labels itself from this, and every row's shop picker reads it. `ensureQueryData`
    // hands back the raw page — `select` only applies to a component's `useQuery`.
    const { items: stores } = await context.queryClient.ensureQueryData(listStoreOptionsQueryOptions());

    // A shop the household no longer has — another member deleted it, or the link was hand-edited.
    // The filter would still send the id while the trigger read "Any shop", so the table and the
    // control that supposedly drives it would disagree.
    if (typeof deps.store === 'number' && !stores.some((store) => store.id === deps.store)) {
      throw redirect({ search: { ...deps, store: undefined }, to: '/food/ingredients' });
    }

    await context.queryClient.ensureQueryData(listIngredientsQueryOptions(deps));
  },
  component: IngredientsRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load your ingredients" />,
});

function IngredientsRoute() {
  const searchParams = Route.useSearch();

  // The header's own "Add ingredient" lives in the layout, which an `<Outlet />` can't hand state
  // to. This one belongs to the empty state's call to action; both open the same dialog.
  const [addOpen, setAddOpen] = useState(false);

  const { data: ingredientsPage } = useSuspenseQuery(listIngredientsQueryOptions(searchParams));
  const { data: stores } = useSuspenseQuery(listStoreOptionsQueryOptions());

  const setSearchParam = useSearchParamSetter(Route);

  const table = useDataTable({
    data: ingredientsPage.items,
    columns: ingredientsTableColumns,
  });

  const isFiltered = Boolean(searchParams.search || searchParams.category || searchParams.store);

  const storeFilterLabel = () => {
    if (searchParams.store === undefined) return 'Any shop';
    if (searchParams.store === SELECT_NONE) return 'No shop';

    return stores.find((store) => store.id === searchParams.store)?.name ?? 'Any shop';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          label="Search ingredients"
          onChange={(next) => setSearchParam('search', next, { replace: true })}
          placeholder="Search ingredients"
          value={searchParams.search}
        />

        <Select
          onValueChange={(value) => setSearchParam('category', value === SELECT_ALL ? undefined : (value as never))}
          value={searchParams.category ?? SELECT_ALL}
        >
          <SelectTrigger className="w-48">
            <span>{searchParams.category ? ingredientCategoryLabels[searchParams.category] : 'Any category'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>Any category</SelectItem>
            <IngredientCategorySelectItems />
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => {
            if (value === SELECT_ALL) return setSearchParam('store', undefined);

            return setSearchParam('store', value === SELECT_NONE ? SELECT_NONE : Number(value));
          }}
          value={searchParams.store === undefined ? SELECT_ALL : searchParams.store.toString()}
        >
          {/* Distinct from a row's own "Shop" cell, which is a combobox with the same purpose. */}
          <SelectTrigger aria-label="Filter by shop" className="w-48">
            <span>{storeFilterLabel()}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>Any shop</SelectItem>
            <StoreSelectItems noneLabel="No shop" />
          </SelectContent>
        </Select>

        <SortDirectionToggle
          onChange={(next) => setSearchParam('sortDirection', next)}
          value={searchParams.sortDirection}
        />
      </div>

      <DataTable
        emptyContent={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CarrotIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No matching ingredients' : 'No ingredients yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try a different search term, or clear the category and shop filters.'
                  : 'Add the staples you cook with — or let them build up as you write recipes.'}
              </EmptyDescription>
            </EmptyHeader>
            {!isFiltered && (
              <EmptyContent>
                <Can access="write" area="ingredients">
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add ingredient
                  </Button>
                </Can>
              </EmptyContent>
            )}
          </Empty>
        }
        table={table}
      />

      <ListPagination page={ingredientsPage} setSearchParam={setSearchParam} />

      <IngredientFormDialog onOpenChange={setAddOpen} open={addOpen} />
    </div>
  );
}
