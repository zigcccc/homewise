import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { pagedQueryParams, searchQueryParam, sortDirection } from '@homewise/server/models';
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
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import { ListPagination, SearchInput, SortDirectionToggle, useSearchParamSetter } from '@/modules/shared';
import { listStoresQueryOptions, StoreFormDialog } from '@/modules/stores';

import { storesTableColumns } from './-stores-table.config';

const searchParamsModel = z.object({
  search: searchQueryParam,
  sortKey: storeSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams.shape,
});

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

  // The header's own "Add shop" lives in the layout, which an `<Outlet />` can't hand state to.
  // This one belongs to the empty state's call to action; both open the same dialog.
  const [addOpen, setAddOpen] = useState(false);

  const { data: storesPage } = useSuspenseQuery(listStoresQueryOptions(searchParams));

  const setSearchParam = useSearchParamSetter(Route);

  const table = useDataTable({
    data: storesPage.items,
    columns: storesTableColumns,
  });

  const isFiltered = Boolean(searchParams.search);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          label="Search shops"
          onChange={(next) => setSearchParam('search', next, { replace: true })}
          placeholder="Search shops"
          value={searchParams.search}
        />

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

      <ListPagination page={storesPage} setSearchParam={setSearchParam} />

      <StoreFormDialog onOpenChange={setAddOpen} open={addOpen} />
    </div>
  );
}
