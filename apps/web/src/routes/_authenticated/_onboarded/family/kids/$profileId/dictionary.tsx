import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDownAZIcon, ArrowUpAZIcon, BookHeartIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { childDictionaryEntrySortDirection, childDictionaryEntrySortKey } from '@homewise/server/child-dictionaries';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
} from '@homewise/ui/core';

import { listChildDictionaryEntriesQueryOptions } from '@/modules/child-dictionaries';
import { getChildProfileQueryOptions } from '@/modules/child-profiles';

import { createEntriesTableColumns, EntryForm } from './-components/entries-table.config';

const searchParamsModel = z.object({
  search: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  sortKey: childDictionaryEntrySortKey.default('childPhrase').catch('childPhrase'),
  sortDirection: childDictionaryEntrySortDirection.default('asc').catch('asc'),
  includeArchived: z.boolean().default(false).catch(false),
});

type SearchParams = z.infer<typeof searchParamsModel>;

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
  const navigate = Route.useNavigate();

  const { data: profile } = useSuspenseQuery(getChildProfileQueryOptions(Number(profileId)));

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

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
  setSearchParam: <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const { data: entries } = useSuspenseQuery(
    listChildDictionaryEntriesQueryOptions(dictionary.id, toQuery(searchParams))
  );

  const columns = createEntriesTableColumns(profileId);
  const table = useReactTable({ data: entries, columns, getCoreRowModel: getCoreRowModel() });

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
        <InputGroup className="w-full sm:w-auto sm:flex-1">
          <InputGroupInput
            defaultValue={searchParams.search ?? ''}
            onChange={(evt) => debouncedSearch(evt.target.value)}
            placeholder="Search words or translations"
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>

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

        <Button
          onClick={() => setSearchParam('sortDirection', searchParams.sortDirection === 'asc' ? 'desc' : 'asc')}
          title={searchParams.sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          variant="outline"
        >
          {searchParams.sortDirection === 'asc' ? <ArrowDownAZIcon /> : <ArrowUpAZIcon />}
          {searchParams.sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </Button>

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
