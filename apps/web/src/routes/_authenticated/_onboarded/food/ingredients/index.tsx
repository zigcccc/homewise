import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CarrotIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { ingredientCategory, ingredientSortDirection, ingredientSortKey } from '@homewise/server/ingredients';
import {
  Button,
  DataTable,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  getRowId,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
} from '@homewise/ui/core';

import {
  IngredientCategorySelectItems,
  IngredientFormDialog,
  ingredientCategoryLabels,
  listIngredientsQueryOptions,
} from '@/modules/ingredients';
import { SELECT_ALL, SELECT_NONE } from '@/modules/shared';
import { listStoresQueryOptions, StoreSelectItems } from '@/modules/stores';

import { ingredientsTableColumns } from './-ingredients-table.config';

const searchParamsModel = z.object({
  search: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  category: ingredientCategory.optional().catch(undefined),
  /** A shop id, or `none` for the ingredients with no shop assigned yet. */
  store: z
    .union([z.literal(SELECT_NONE), z.number().int().positive()])
    .optional()
    .catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: ingredientSortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listIngredientsQueryOptions(deps)),
      // The shop filter labels itself from this, and every row's shop picker reads it.
      context.queryClient.ensureQueryData(listStoresQueryOptions()),
    ]);
  },
  component: IngredientsRoute,
  pendingComponent: () => <Spinner />,
});

function IngredientsRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  // The header's own "Add ingredient" lives in the layout, which an `<Outlet />` can't hand state
  // to. This one belongs to the empty state's call to action; both open the same dialog.
  const [addOpen, setAddOpen] = useState(false);

  const { data: ingredients } = useSuspenseQuery(listIngredientsQueryOptions(searchParams));
  const { data: stores } = useSuspenseQuery(listStoresQueryOptions());

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useReactTable({
    data: ingredients,
    columns: ingredientsTableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
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
        <InputGroup className="w-full sm:w-auto sm:flex-1">
          <InputGroupInput
            defaultValue={searchParams.search ?? ''}
            onChange={(evt) => debouncedSearch(evt.target.value)}
            placeholder="Search ingredients"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

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

        <Button
          onClick={() => setSearchParam('sortDirection', searchParams.sortDirection === 'asc' ? 'desc' : 'asc')}
          variant="outline"
        >
          {searchParams.sortDirection === 'asc' ? 'A → Z' : 'Z → A'}
        </Button>
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
                <Button onClick={() => setAddOpen(true)}>
                  <PlusIcon />
                  Add ingredient
                </Button>
              </EmptyContent>
            )}
          </Empty>
        }
        table={table}
      />

      <IngredientFormDialog onOpenChange={setAddOpen} open={addOpen} />
    </div>
  );
}
