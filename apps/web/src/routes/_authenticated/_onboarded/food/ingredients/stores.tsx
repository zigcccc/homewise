import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, SearchIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { searchQueryParam, sortDirection } from '@homewise/server/models';
import { storeSortKey } from '@homewise/server/stores';
import {
  Button,
  DataTable,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import { listStoresQueryOptions, StoreFormDialog } from '@/modules/stores';

import { storesTableColumns } from './-stores-table.config';

const searchParamsModel = z.object({
  search: searchQueryParam,
  sortKey: storeSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients/stores')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listStoresQueryOptions(deps));
  },
  component: StoresRoute,
  pendingComponent: () => <Spinner />,
});

function StoresRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  // The header's own "Add shop" lives in the layout, which an `<Outlet />` can't hand state to.
  // This one belongs to the empty state's call to action; both open the same dialog.
  const [addOpen, setAddOpen] = useState(false);

  const { data: stores } = useSuspenseQuery(listStoresQueryOptions(searchParams));

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useDataTable({
    data: stores,
    columns: storesTableColumns,
  });

  const isFiltered = Boolean(searchParams.search);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-auto sm:flex-1">
          <InputGroupInput
            defaultValue={searchParams.search ?? ''}
            onChange={(evt) => debouncedSearch(evt.target.value)}
            placeholder="Search shops"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

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
                <StoreIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No matching shops' : 'No shops yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try a different search term.'
                  : 'Add the shops you buy at, then assign ingredients to them — a shopping list gets one section per shop.'}
              </EmptyDescription>
            </EmptyHeader>
            {!isFiltered && (
              <EmptyContent>
                <Button onClick={() => setAddOpen(true)}>
                  <PlusIcon />
                  Add shop
                </Button>
              </EmptyContent>
            )}
          </Empty>
        }
        table={table}
      />

      <StoreFormDialog onOpenChange={setAddOpen} open={addOpen} />
    </div>
  );
}
