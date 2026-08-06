import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PackageOpenIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { searchQueryParam, sortDirection } from '@homewise/server/models';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import { Actionbar, RouteError } from '@/modules/shared';
import {
  createStorageItemColumns,
  ItemFormDialog,
  LOAN_FILTER_LABELS,
  listStorageItemsQueryOptions,
} from '@/modules/storage-items';
import { listStorageLocationsQueryOptions } from '@/modules/storage-locations';

const searchParamsModel = z.object({
  search: searchQueryParam,
  locationId: z.coerce.number<number>().int().positive().optional().catch(undefined),
  loanStatus: storageItemLoanStatus.default('all').catch('all'),
  sortKey: storageItemSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

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
  const navigate = Route.useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const { data: items } = useSuspenseQuery(listStorageItemsQueryOptions(searchParams));
  const { data: locations } = useSuspenseQuery(listStorageLocationsQueryOptions());

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useDataTable({ columns, data: items, getRowId });

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

      <main className="flex-1 space-y-6 p-4">
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
          <InputGroup className="w-full sm:w-auto sm:flex-1">
            <InputGroupInput
              defaultValue={searchParams.search ?? ''}
              onChange={(evt) => debouncedSearch(evt.target.value)}
              placeholder="Search items and notes"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          <Select
            onValueChange={(value) => setSearchParam('locationId', value === 'all' ? undefined : Number(value))}
            value={searchParams.locationId?.toString() ?? 'all'}
          >
            <SelectTrigger className="w-44">
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
            <SelectTrigger className="w-36">
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
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="createdAt">Date added</SelectItem>
              <SelectItem value="dueOn">Due back</SelectItem>
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

        {addOpen && <ItemFormDialog onOpenChange={setAddOpen} open={addOpen} />}
      </main>
    </>
  );
}
