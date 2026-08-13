import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PackageOpenIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { pagedQueryParams, searchQueryParam, sortDirection } from '@homewise/server/models';
import { storageItemLoanStatus, storageItemSortKey } from '@homewise/server/storage-items';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import {
  Actionbar,
  ListPagination,
  PageLayout,
  RouteError,
  SearchInput,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';
import {
  createStorageItemColumns,
  ItemFormDialog,
  LOAN_FILTER_LABELS,
  listStorageItemsQueryOptions,
  STORAGE_ITEM_SORT_DIRECTION_LABELS,
} from '@/modules/storage-items';
import { listStorageLocationOptionsQueryOptions, listStorageLocationsQueryOptions } from '@/modules/storage-locations';

const searchParamsModel = z.object({
  search: searchQueryParam,
  locationId: z.coerce.number<number>().int().positive().optional().catch(undefined),
  loanStatus: storageItemLoanStatus.default('all').catch('all'),
  sortKey: storageItemSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams.shape,
});

export const Route = createFileRoute('/_authenticated/_onboarded/storage/items/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listStorageItemsQueryOptions(deps)),
      context.queryClient.ensureQueryData(listStorageLocationsQueryOptions()),
    ]);
  },
  component: StorageItemsRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load your things" />,
});

const columns = createStorageItemColumns({ showLocation: true });

function StorageItemsRoute() {
  const searchParams = Route.useSearch();
  const [addOpen, setAddOpen] = useState(false);

  const { data: itemsPage } = useSuspenseQuery(listStorageItemsQueryOptions(searchParams));
  // Names only — the filter never shows a count, and reading one would re-render this whole page
  // every time anybody in the household stored something.
  const { data: locations } = useSuspenseQuery(listStorageLocationOptionsQueryOptions());

  const setSearchParam = useSearchParamSetter(Route);

  const table = useDataTable({ columns, data: itemsPage.items, getRowId });

  const isFiltered =
    Boolean(searchParams.search) || searchParams.loanStatus !== 'all' || Boolean(searchParams.locationId);
  const hasLocations = locations.length > 0;

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
            <BreadcrumbItem>Storage</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Items</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-medium text-lg">Items</h1>
            <p className="text-muted-foreground text-sm">
              Everything the household keeps somewhere — and who currently has it.
            </p>
          </div>
          <Button disabled={!hasLocations} onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Add item
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Search items"
            onChange={(next) => setSearchParam('search', next, { replace: true })}
            placeholder="Search items and notes"
            value={searchParams.search}
          />

          <Select
            onValueChange={(value) => setSearchParam('locationId', value === 'all' ? undefined : Number(value))}
            value={searchParams.locationId?.toString() ?? 'all'}
          >
            <SelectTrigger aria-label="Filter by location" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everywhere</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id.toString()}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => setSearchParam('loanStatus', searchParamsModel.shape.loanStatus.parse(value))}
            value={searchParams.loanStatus}
          >
            <SelectTrigger aria-label="Filter by status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOAN_FILTER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => setSearchParam('sortKey', searchParamsModel.shape.sortKey.parse(value))}
            value={searchParams.sortKey}
          >
            <SelectTrigger aria-label="Sort by" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="createdAt">Date added</SelectItem>
              <SelectItem value="dueOn">Due back</SelectItem>
            </SelectContent>
          </Select>

          <SortDirectionToggle
            labels={STORAGE_ITEM_SORT_DIRECTION_LABELS[searchParams.sortKey]}
            onChange={(next) => setSearchParam('sortDirection', next)}
            value={searchParams.sortDirection}
          />
        </div>

        <DataTable
          emptyContent={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpenIcon />
                </EmptyMedia>
                <EmptyTitle>{isFiltered ? 'Nothing matches' : 'Nothing in storage yet'}</EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? 'Try a different search, location or status.'
                    : hasLocations
                      ? 'Add what you keep where, so "where did we put the tent?" has an answer.'
                      : 'Add a storage location first — every item lives in one.'}
                </EmptyDescription>
              </EmptyHeader>
              {!isFiltered && (
                <EmptyContent>
                  {hasLocations ? (
                    <Button onClick={() => setAddOpen(true)}>
                      <PlusIcon />
                      Add item
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/storage/locations">
                        <PlusIcon />
                        Add a location
                      </Link>
                    </Button>
                  )}
                </EmptyContent>
              )}
            </Empty>
          }
          table={table}
        />

        <ListPagination page={itemsPage} setSearchParam={setSearchParam} />

        {addOpen && <ItemFormDialog onOpenChange={setAddOpen} open={addOpen} />}
      </PageLayout>
    </>
  );
}
