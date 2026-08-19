import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MapPinIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { searchQueryParam, sortDirection } from '@homewise/server/models';
import { storageLocationSortKey } from '@homewise/server/storage-locations';
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  MapCenter,
  MapMarker,
  MapPopup,
  MapTileLayer,
  MapView,
  MapZoomControl,
  Spinner,
} from '@homewise/ui/core';

import {
  Actionbar,
  Can,
  PageLayout,
  RouteError,
  SearchInput,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';
import { LocationFormDialog, listStorageLocationsQueryOptions } from '@/modules/storage-locations';

const searchParamsModel = z.object({
  search: searchQueryParam,
  sortKey: storageLocationSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});

export const Route = createFileRoute('/_authenticated/_onboarded/storage/locations/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listStorageLocationsQueryOptions(deps));
  },
  component: StorageLocationsRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load your storage locations" />,
});

function StorageLocationsRoute() {
  const searchParams = Route.useSearch();
  const [addOpen, setAddOpen] = useState(false);

  const { data: locations } = useSuspenseQuery(listStorageLocationsQueryOptions(searchParams));

  const setSearchParam = useSearchParamSetter(Route);

  const isFiltered = Boolean(searchParams.search);
  const pinned = locations.filter((location) => location.latitude !== null && location.longitude !== null);

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
              <BreadcrumbPage>Locations</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-medium text-lg">Storage locations</h1>
            <p className="text-muted-foreground text-sm">The places you keep things, and how much is in each.</p>
          </div>
          <Can area="storageLocations">
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon />
              Add location
            </Button>
          </Can>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Search locations"
            onChange={(next) => setSearchParam('search', next, { replace: true })}
            placeholder="Search locations and addresses"
            value={searchParams.search}
          />

          <SortDirectionToggle
            onChange={(next) => setSearchParam('sortDirection', next)}
            value={searchParams.sortDirection}
          />
        </div>

        {/* Only worth drawing once something is actually on it. */}
        {pinned.length > 0 && <LocationsOverviewMap locations={pinned} />}

        {locations.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No matching locations' : 'No storage locations yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try a different search term.'
                  : 'Add the places you keep things — the garage, the cellar, a storage unit across town.'}
              </EmptyDescription>
            </EmptyHeader>
            {!isFiltered && (
              <EmptyContent>
                <Can area="storageLocations">
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add location
                  </Button>
                </Can>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((location) => (
              <Link
                key={location.id}
                params={{ locationId: location.id.toString() }}
                to="/storage/locations/$locationId"
              >
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPinIcon className="size-4 text-muted-foreground" />
                      {location.name}
                    </CardTitle>
                    <CardDescription>{location.address || 'No address'}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    {location.itemCount} {location.itemCount === 1 ? 'item' : 'items'}
                    {location.onLoanCount > 0 && ` · ${location.onLoanCount} out on loan`}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {addOpen && <LocationFormDialog onOpenChange={setAddOpen} open={addOpen} />}
      </PageLayout>
    </>
  );
}

/** Every pinned location on one map, so "which of these is nearest" is a glance rather than a list. */
function LocationsOverviewMap({
  locations,
}: {
  locations: { id: number; latitude: number | null; longitude: number | null; name: string }[];
}) {
  const first = locations[0];

  // Null, not falsy: 0 is a coordinate, and the zero meridian runs through places people live.
  if (first?.latitude == null || first.longitude == null) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <MapView center={[first.latitude, first.longitude]} className="min-h-64" zoom={11}>
        <MapTileLayer />
        <MapCenter latitude={first.latitude} longitude={first.longitude} zoom={11} />
        <MapZoomControl />
        {locations.map(
          (location) =>
            location.latitude !== null &&
            location.longitude !== null && (
              <MapMarker key={location.id} position={[location.latitude, location.longitude]} title={location.name}>
                <MapPopup>
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    params={{ locationId: location.id.toString() }}
                    to="/storage/locations/$locationId"
                  >
                    {location.name}
                  </Link>
                </MapPopup>
              </MapMarker>
            )
        )}
      </MapView>
    </div>
  );
}
