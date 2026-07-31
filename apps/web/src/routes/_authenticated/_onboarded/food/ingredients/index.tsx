import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CarrotIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { ingredientCategory, ingredientSortDirection, ingredientSortKey } from '@homewise/server/ingredients';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
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
import { Actionbar, SELECT_ALL } from '@/modules/shared';

import { ingredientsTableColumns } from './-ingredients-table.config';

const searchParamsModel = z.object({
  search: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  category: ingredientCategory.optional().catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: ingredientSortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listIngredientsQueryOptions(deps));
  },
  component: IngredientsRoute,
  pendingComponent: () => <Spinner />,
});

function IngredientsRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  const [addOpen, setAddOpen] = useState(false);

  const { data: ingredients } = useSuspenseQuery(listIngredientsQueryOptions(searchParams));

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useReactTable({
    data: ingredients,
    columns: ingredientsTableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const isFiltered = Boolean(searchParams.search || searchParams.category);

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
            <BreadcrumbItem>Food & Groceries</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Ingredients</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">Ingredients</h1>
            <p className="text-muted-foreground text-sm">
              Your pantry vocabulary. Recipes reference these, and shopping lists will add them up.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Add ingredient
          </Button>
        </div>

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
                    ? 'Try a different search term or clear the category filter.'
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
      </main>
    </>
  );
}
