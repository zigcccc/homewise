import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  BookHeartIcon,
  MoreHorizontal,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { childDictionaryEntrySortDirection, childDictionaryEntrySortKey } from '@homewise/server/child-dictionaries';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

import { client, parseResponse } from '@/api/client';
import { getChildDictionaryQueryOptions, listChildDictionaryEntriesQueryOptions } from '@/modules/child-dictionaries';
import { ConfirmDeleteDialog } from '@/modules/shared/components';

import { Actionbar } from '../../../-components/Actionbar';
import { EntryForm, entriesTableColumns, invalidateDictionary } from './-entries-table.config';

const searchParamsModel = z.object({
  search: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  sortKey: childDictionaryEntrySortKey.default('childPhrase').catch('childPhrase'),
  sortDirection: childDictionaryEntrySortDirection.default('asc').catch('asc'),
  includeArchived: z.boolean().default(false).catch(false),
});

const sortKeyLabels: Record<z.infer<typeof childDictionaryEntrySortKey>, string> = {
  childPhrase: 'Child phrase',
  adultTranslation: 'Translation',
  createdAt: 'Date added',
};

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids-dictionaries/$dictionaryId')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, params, deps }) {
    const dictionaryId = Number(params.dictionaryId);

    await Promise.all([
      context.queryClient.ensureQueryData(getChildDictionaryQueryOptions(dictionaryId)),
      context.queryClient.ensureQueryData(listChildDictionaryEntriesQueryOptions(dictionaryId, toQuery(deps))),
    ]);
  },
  component: KidsDictionaryDetailRoute,
  pendingComponent: () => <Spinner />,
});

/** Search params are typed; the RPC query string wants strings. */
function toQuery(search: z.infer<typeof searchParamsModel>) {
  return {
    search: search.search,
    sortKey: search.sortKey,
    sortDirection: search.sortDirection,
    includeArchived: search.includeArchived ? 'true' : 'false',
  };
}

function KidsDictionaryDetailRoute() {
  const { dictionaryId } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const id = Number(dictionaryId);

  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: dictionary } = useSuspenseQuery(getChildDictionaryQueryOptions(id));
  const { data: entries } = useSuspenseQuery(listChildDictionaryEntriesQueryOptions(id, toQuery(searchParams)));

  const { mutateAsync: deleteDictionary } = useMutation({
    mutationFn: async () =>
      parseResponse(client['child-dictionaries'][':id'].$delete({ param: { id: id.toString() } })),
  });

  const handleDeleteDictionary = async () => {
    try {
      await deleteDictionary();
      toast.success(`${dictionary.child.displayName}'s dictionary deleted.`);
      await navigate({ to: '/family/kids-dictionaries' });
      // After navigating away, so the removed dictionary's detail query can't refetch into a 404.
      invalidateDictionary(queryClient, id);
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const table = useReactTable({ data: entries, columns: entriesTableColumns, getCoreRowModel: getCoreRowModel() });

  const setSearchParam = <Key extends keyof z.infer<typeof searchParamsModel>>(
    key: Key,
    value: z.infer<typeof searchParamsModel>[Key]
  ) => navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const title = `${dictionary.child.displayName}'s dictionary`;
  const isFiltered = Boolean(searchParams.search);

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
            <BreadcrumbItem>Family</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/family/kids-dictionaries">Kids dictionaries</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{dictionary.child.displayName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">{title}</h1>
            <p className="text-muted-foreground text-sm">
              {dictionary.entryCount} {dictionary.entryCount === 1 ? 'word' : 'words'} collected
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon />
              Add word
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 w-9 p-0" variant="outline">
                  <span className="sr-only">Dictionary actions</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                  <TrashIcon />
                  Delete dictionary
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
                  {isFiltered
                    ? 'Try a different search term.'
                    : `Add the first word ${dictionary.child.displayName} invented.`}
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
              <DialogDescription>
                What does {dictionary.child.displayName} say, and what do they mean by it?
              </DialogDescription>
            </DialogHeader>
            <EntryForm dictionaryId={id} onDone={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>

        <ConfirmDeleteDialog
          confirmLabel="Delete dictionary"
          description={
            <>
              {dictionary.child.displayName}'s dictionary and all {dictionary.entryCount}{' '}
              {dictionary.entryCount === 1 ? 'word' : 'words'} in it will be permanently deleted. This can't be undone.
            </>
          }
          onConfirm={handleDeleteDictionary}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title={`Delete ${dictionary.child.displayName}'s dictionary?`}
        />
      </main>
    </>
  );
}
