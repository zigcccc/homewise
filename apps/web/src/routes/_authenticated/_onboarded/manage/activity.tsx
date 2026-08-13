import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { HistoryIcon, SearchIcon } from 'lucide-react';
import { useDebounceCallback } from 'usehooks-ts';
import type z from 'zod';

import { activityFiltersModel } from '@homewise/server/activity';
import { householdEventEntity } from '@homewise/server/realtime';
import {
  Avatar,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import {
  ACTIVITY_ENTITY_FILTER_LABELS,
  ActivityChanges,
  type ActivityEntry,
  ActivityEntryLine,
  actorInitials,
  collapseChanges,
  groupByDay,
  listActivityQueryOptions,
} from '@/modules/activity';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar, PageLayout, RouteError, TimeAgo } from '@/modules/shared';

type SearchParams = z.infer<typeof activityFiltersModel>;

/**
 * One line of the feed. A row is one or two lines high depending on whether the save left a diff,
 * and the avatar follows: centred against one line, aligned to the first of a pair.
 */
function FeedRow({ entry }: { entry: ActivityEntry }) {
  const detailed = collapseChanges(entry.changes).length > 0;

  return (
    <div
      className={cn('flex gap-3 py-2.5 text-sm', detailed ? 'items-start' : 'items-center')}
      data-testid="activity-entry"
    >
      <Avatar className={cn('size-7 shrink-0', detailed && 'mt-0.5')}>
        <AvatarFallback className="text-xs">{actorInitials(entry.actorName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <ActivityEntryLine entry={entry} />
        <ActivityChanges changes={entry.changes} className="mt-0.5 text-muted-foreground" />
      </div>
      <TimeAgo className="shrink-0 text-muted-foreground text-xs" value={entry.updatedAt} />
    </div>
  );
}

export const Route = createFileRoute('/_authenticated/_onboarded/manage/activity')({
  validateSearch: activityFiltersModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(listActivityQueryOptions(deps)),
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
    ]);
  },
  component: ActivityRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load your activity" />,
});

function ActivityRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    listActivityQueryOptions(searchParams)
  );
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const entries = data.pages.flatMap((page) => page.entries);
  const groups = groupByDay(entries);
  const isFiltered = Boolean(searchParams.search) || Boolean(searchParams.entity) || Boolean(searchParams.actorId);

  // Only members with an account can have acted — a managed member is somebody's kid, not a login.
  const actors = household.members.filter((member) => member.userId !== null);

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
            <BreadcrumbItem>Manage</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Activity</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div>
          <h1 className="font-medium text-lg">Activity</h1>
          <p className="text-muted-foreground text-sm">What everyone's been up to — who changed what, and when.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-auto sm:flex-1">
            <InputGroupInput
              aria-label="Search activity"
              defaultValue={searchParams.search ?? ''}
              onChange={(evt) => debouncedSearch(evt.target.value)}
              placeholder="Search what changed"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          <Select
            onValueChange={(value) => setSearchParam('actorId', value === 'all' ? undefined : value)}
            value={searchParams.actorId ?? 'all'}
          >
            <SelectTrigger aria-label="Filter by member" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {actors.map((member) => (
                <SelectItem key={member.id} value={member.userId ?? ''}>
                  {member.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) =>
              setSearchParam('entity', value === 'all' ? undefined : householdEventEntity.parse(value))
            }
            value={searchParams.entity ?? 'all'}
          >
            <SelectTrigger aria-label="Filter by kind" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              {householdEventEntity.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {ACTIVITY_ENTITY_FILTER_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'Nothing matches' : 'Nothing yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try a different search, member or kind.'
                  : 'As the household adds and changes things, they show up here.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6" data-testid="activity-feed">
            {groups.map((group) => (
              <section key={group.heading}>
                <h2 className="pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group.heading}
                </h2>
                <div className="divide-y">
                  {group.entries.map((entry) => (
                    <FeedRow entry={entry} key={entry.id} />
                  ))}
                </div>
              </section>
            ))}

            {hasNextPage && (
              <div className="flex justify-center">
                <Button disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} variant="outline">
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}
      </PageLayout>
    </>
  );
}
