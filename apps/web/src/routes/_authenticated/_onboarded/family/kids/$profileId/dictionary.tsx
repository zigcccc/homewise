import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BookHeartIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { childDictionaryEntrySortKey } from '@homewise/server/child-dictionaries';
import { pagedQueryParams, searchQueryParam, sortDirection } from '@homewise/server/models';
import {
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import { listChildDictionaryEntriesQueryOptions } from '@/modules/child-dictionaries';
import { getChildProfileQueryOptions } from '@/modules/child-profiles';
import {
  ListPagination,
  SearchInput,
  type SearchParamSetter,
  SORT_LABELS,
  type SortDirectionLabels,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';

import { createEntriesTableColumns, EntryForm } from './-components/entries-table.config';

const searchParamsModel = z.object({
  search: searchQueryParam,
  sortKey: childDictionaryEntrySortKey.default('childPhrase').catch('childPhrase'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  includeArchived: z.boolean().default(false).catch(false),
  ...pagedQueryParams.shape,
});

type SearchParams = z.infer<typeof searchParamsModel>;

/** Ascending reads differently per column: A → Z for a phrase, oldest-first for a date. */
const sortDirectionLabels: Record<z.infer<typeof childDictionaryEntrySortKey>, SortDirectionLabels> = {
  childPhrase: SORT_LABELS.text,
  adultTranslation: SORT_LABELS.text,
  createdAt: SORT_LABELS.date,
};

const sortKeyLabels: Record<z.infer<typeof childDictionaryEntrySortKey>, string> = {
  childPhrase: 'Child phrase',
  adultTranslation: 'Translation',
  createdAt: 'Date added',
};

/** Search params are typed; the RPC query string wants strings. */
function toQuery(search: SearchParams) {
  return {
    search: search.search,
    sortKey: search.sortKey,
    sortDirection: search.sortDirection,
    includeArchived: search.includeArchived ? 'true' : 'false',
    page: search.page,
    pageSize: search.pageSize,
  };
}

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids/$profileId/dictionary')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, params, deps }) {
    const profile = await context.queryClient.ensureQueryData(getChildProfileQueryOptions(Number(params.profileId)));

    if (profile.dictionary) {
      await context.queryClient.ensureQueryData(
        listChildDictionaryEntriesQueryOptions(profile.dictionary.id, toQuery(deps))
      );
    }
  },
  component: DictionaryTab,
  pendingComponent: () => <Spinner />,
});

function DictionaryTab() {
  const { profileId } = Route.useParams();
  const searchParams = Route.useSearch();

  const { data: profile } = useSuspenseQuery(getChildProfileQueryOptions(Number(profileId)));

  const setSearchParam = useSearchParamSetter(Route);

  // Guard before the entries query runs — otherwise a dictionary-less profile would request
  // `/entries/0` and 404 into the route error state instead of showing this empty state.
  if (!profile.dictionary) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookHeartIcon />
          </EmptyMedia>
          <EmptyTitle>No dictionary</EmptyTitle>
          <EmptyDescription>This profile has no dictionary yet.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DictionaryEntries
      childName={profile.child.displayName}
      dictionary={profile.dictionary}
      profileId={profile.id}
      searchParams={searchParams}
      setSearchParam={setSearchParam}
    />
  );
}

function DictionaryEntries({
  childName,
  dictionary,
  profileId,
  searchParams,
  setSearchParam,
}: {
  childName: string;
  dictionary: { id: number; entryCount: number };
  profileId: number;
  searchParams: SearchParams;
  setSearchParam: SearchParamSetter<typeof Route>;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: entriesPage } = useSuspenseQuery(
    listChildDictionaryEntriesQueryOptions(dictionary.id, toQuery(searchParams))
  );

  const columns = createEntriesTableColumns(profileId);
  const table = useDataTable({ data: entriesPage.items, columns });

  const isFiltered = Boolean(searchParams.search);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {dictionary.entryCount} {dictionary.entryCount === 1 ? 'word' : 'words'} collected
        </p>
        <Button onClick={() => setAddOpen(true)}>
          <PlusIcon />
          Add word
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          label="Search dictionary"
          onChange={(next) => setSearchParam('search', next, { replace: true })}
          placeholder="Search words or translations"
          value={searchParams.search}
        />

        <Select onValueChange={(value) => setSearchParam('sortKey', value as never)} value={searchParams.sortKey}>
          <SelectTrigger className="w-56">
            {/* Explicit label rather than <SelectValue>, so the trigger states what the control does. */}
            <span>
              Sort by: <span className="font-medium">{sortKeyLabels[searchParams.sortKey]}</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {childDictionaryEntrySortKey.options.map((option) => (
              <SelectItem key={option} value={option}>
                {sortKeyLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SortDirectionToggle
          labels={sortDirectionLabels[searchParams.sortKey]}
          onChange={(next) => setSearchParam('sortDirection', next)}
          value={searchParams.sortDirection}
        />

        <Label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={searchParams.includeArchived}
            onCheckedChange={(checked) => setSearchParam('includeArchived', checked === true)}
          />
          Show archived
        </Label>
      </div>

      <DataTable
        emptyContent={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookHeartIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No matching words' : 'No words yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered ? 'Try a different search term.' : `Add the first word ${childName} invented.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        table={table}
      />

      <ListPagination page={entriesPage} setSearchParam={setSearchParam} />

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a word</DialogTitle>
            <DialogDescription>What does {childName} say, and what do they mean by it?</DialogDescription>
          </DialogHeader>
          <EntryForm dictionaryId={dictionary.id} onDone={() => setAddOpen(false)} profileId={profileId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
