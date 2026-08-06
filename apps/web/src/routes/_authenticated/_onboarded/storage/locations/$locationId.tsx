import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  MapPinIcon,
  MoreHorizontal,
  NavigationIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

import { parseResponse } from '@/api/client';
import { Actionbar, ConfirmDeleteDialog, ExternalLink, RouteError, serverMessage } from '@/modules/shared';
import {
  createStorageItemColumns,
  ItemFormDialog,
  invalidateStorageItems,
  LOAN_FILTER_LABELS,
  listStorageItemsQueryOptions,
} from '@/modules/storage-items';
import {
  $deleteStorageLocation,
  directionsUrl,
  getStorageLocationQueryOptions,
  invalidateStorageLocations,
  LocationFormDialog,
  LocationMap,
  type StorageLocation,
} from '@/modules/storage-locations';

const searchParamsModel = z.object({
  search: searchQueryParam,
  loanStatus: storageItemLoanStatus.default('all').catch('all'),
  sortKey: storageItemSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/storage/locations/$locationId')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps, params }) {
    const locationId = Number(params.locationId);

    await Promise.all([
      context.queryClient.ensureQueryData(getStorageLocationQueryOptions(locationId)),
      context.queryClient.ensureQueryData(listStorageItemsQueryOptions({ ...deps, locationId })),
    ]);
  },
  component: StorageLocationRoute,
  pendingComponent: () => <Spinner />,
  // Another member can delete a location while you're looking at it, and a realtime refetch lands on
  // the 404 — so this one says the thing is gone rather than "something went wrong".
  errorComponent: () => (
    <RouteError description="It may have been removed by someone else in your household." title="This location is gone">
      <Button asChild variant="outline">
        <Link to="/storage/locations">Back to locations</Link>
      </Button>
    </RouteError>
  ),
});

// The location column would repeat this page's own title on every row.
const columns = createStorageItemColumns({ showLocation: false });

function StorageLocationRoute() {
  const { locationId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const { data: location } = useSuspenseQuery(getStorageLocationQueryOptions(Number(locationId)));
  const { data: items } = useSuspenseQuery(
    listStorageItemsQueryOptions({ ...searchParams, locationId: Number(locationId) })
  );

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useDataTable({ columns, data: items, getRowId });

  const isFiltered = Boolean(searchParams.search) || searchParams.loanStatus !== 'all';
  const pin =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;

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
                <Link to="/storage/locations">Locations</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{location.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 font-medium text-lg">
              <MapPinIcon className="size-4 text-muted-foreground" />
              {location.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {location.itemCount} {location.itemCount === 1 ? 'item' : 'items'}
              {location.onLoanCount > 0 && ` · ${location.onLoanCount} out on loan`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon />
              Add item
            </Button>
            <LocationActions location={location} />
          </div>
        </div>

        <Card className="lg:max-w-2/3">
          <CardHeader>
            <CardTitle className="text-base">Where it is</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{location.address || 'No address recorded.'}</p>
            <LocationMap name={location.name} value={pin} />
            {pin && (
              <Button asChild size="sm" variant="outline">
                <ExternalLink href={directionsUrl(pin)}>
                  <NavigationIcon />
                  Directions
                </ExternalLink>
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-auto sm:flex-1">
            <InputGroupInput
              defaultValue={searchParams.search ?? ''}
              onChange={(evt) => debouncedSearch(evt.target.value)}
              placeholder="Search this location"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

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
                <EmptyTitle>{isFiltered ? 'Nothing matches' : `Nothing in ${location.name} yet`}</EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? 'Try a different search or status.'
                    : 'Add what you keep here, so you can find it again without opening the door.'}
                </EmptyDescription>
              </EmptyHeader>
              {!isFiltered && (
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add item
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          }
          table={table}
        />

        {addOpen && <ItemFormDialog locationId={location.id} onOpenChange={setAddOpen} open={addOpen} />}
      </main>
    </>
  );
}

function LocationActions({ location }: { location: StorageLocation }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteLocation } = useMutation({
    mutationFn: async () => parseResponse($deleteStorageLocation({ param: { id: location.id.toString() } })),
  });

  const handleDelete = async () => {
    try {
      await deleteLocation();
      toast.success(`"${location.name}" deleted.`);
      // Navigate before invalidating: refetching first would land this page's own loader on a 404.
      await navigate({ to: '/storage/locations' });
      invalidateStorageLocations(queryClient);
      invalidateStorageItems(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-9 w-9 p-0" variant="ghost">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit location
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
            <TrashIcon />
            Delete location
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && <LocationFormDialog location={location} onOpenChange={setEditOpen} open={editOpen} />}

      <ConfirmDeleteDialog
        confirmLabel="Delete location"
        description={
          location.itemCount > 0 ? (
            <>
              "{location.name}" and the {location.itemCount} {location.itemCount === 1 ? 'item' : 'items'} stored here
              will be permanently removed. Move anything you want to keep to another location first.
            </>
          ) : (
            <>"{location.name}" will be permanently removed from your storage locations.</>
          )
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${location.name}"?`}
      />
    </>
  );
}
