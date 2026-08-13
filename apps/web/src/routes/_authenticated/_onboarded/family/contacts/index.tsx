import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookUserIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import { contactSortKey, contactType } from '@homewise/server/contacts';
import { searchQueryParam, sortDirection } from '@homewise/server/models';
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

import { ContactDialog, contactTypeLabels, listContactsQueryOptions } from '@/modules/contacts';
import {
  Actionbar,
  PageLayout,
  RouteError,
  SearchInput,
  SORT_LABELS,
  type SortDirectionLabels,
  SortDirectionToggle,
  useSearchParamSetter,
} from '@/modules/shared';

import { contactColumns } from './-contacts-table.config';

const searchParamsModel = z.object({
  search: searchQueryParam,
  type: contactType.optional().catch(undefined),
  sortKey: contactSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});

type ContactSortKey = z.infer<typeof contactSortKey>;

/**
 * Both records are `satisfies Record<ContactSortKey, …>` so a sort key added on the server is a
 * compile error here rather than a key the picker never offers and a toggle that quietly falls back
 * to the wrong words.
 */
const SORT_KEY_LABELS = {
  name: 'Name',
  birthday: 'Birthday',
  createdAt: 'Date added',
} satisfies Record<ContactSortKey, string>;

/** Ascending reads differently per column: A → Z for a name, but soonest-first for a birthday. */
const SORT_DIRECTION_LABELS = {
  name: SORT_LABELS.text,
  birthday: SORT_LABELS.recurring,
  createdAt: SORT_LABELS.date,
} satisfies Record<ContactSortKey, SortDirectionLabels>;

export const Route = createFileRoute('/_authenticated/_onboarded/family/contacts/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listContactsQueryOptions(deps));
  },
  component: ContactsRoute,
  pendingComponent: () => <Spinner />,
  errorComponent: () => <RouteError title="Couldn't load your contacts" />,
});

function ContactsRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const { data: contacts } = useSuspenseQuery(listContactsQueryOptions(searchParams));

  const setSearchParam = useSearchParamSetter(searchParams);

  const table = useDataTable({ columns: contactColumns, data: contacts, getRowId });

  const isFiltered = Boolean(searchParams.search) || Boolean(searchParams.type);

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
            <BreadcrumbItem>Family &amp; friends</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Contacts</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-medium text-lg">Contacts</h1>
            <p className="text-muted-foreground text-sm">
              The household address book — family, friends, and everyone you'd rather not have to look up.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Add contact
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            label="Search contacts"
            onChange={(next) => setSearchParam('search', next, { replace: true })}
            placeholder="Search names, phones and emails"
            value={searchParams.search}
          />

          <Select
            onValueChange={(value) => setSearchParam('type', value === 'all' ? undefined : contactType.parse(value))}
            value={searchParams.type ?? 'all'}
          >
            <SelectTrigger aria-label="Filter by type" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {contactType.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {contactTypeLabels[option]}
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
              {contactSortKey.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {SORT_KEY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SortDirectionToggle
            labels={SORT_DIRECTION_LABELS[searchParams.sortKey]}
            onChange={(next) => setSearchParam('sortDirection', next)}
            value={searchParams.sortDirection}
          />
        </div>

        <DataTable
          emptyContent={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookUserIcon />
                </EmptyMedia>
                <EmptyTitle>{isFiltered ? 'Nobody matches' : 'No contacts yet'}</EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? 'Try a different search or type.'
                    : 'Add the people the household keeps track of — and the birthdays you keep forgetting.'}
                </EmptyDescription>
              </EmptyHeader>
              {!isFiltered && (
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add contact
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          }
          onRowClick={(contact) =>
            navigate({ params: { contactId: contact.id.toString() }, to: '/family/contacts/$contactId' })
          }
          table={table}
        />

        {addOpen && <ContactDialog onOpenChange={setAddOpen} open={addOpen} />}
      </PageLayout>
    </>
  );
}
