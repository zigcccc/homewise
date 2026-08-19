import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';
import { flattenOptionPages, nextPageParam, OPTIONS_PAGE_SIZE, OPTIONS_STALE_TIME } from '@/modules/shared';

const $listContacts = client.contacts.$get;
const $createContact = client.contacts.$post;
const $readContact = client.contacts[':id'].$get;
const $patchContact = client.contacts[':id'].$patch;
const $deleteContact = client.contacts[':id'].$delete;
const $addContactRelation = client.contacts[':id'].relations.$post;
const $patchContactRelation = client.contacts[':id'].relations[':relationId'].$patch;
const $removeContactRelation = client.contacts[':id'].relations[':relationId'].$delete;

export type ListContactsQuery = InferRequestType<typeof $listContacts>['query'];

/** A household contact as the list endpoint returns it — the address book row. */
type ContactsPage = InferResponseType<typeof $listContacts, 200>;
export type HouseholdContact = ContactsPage['items'][number];

/** A freshly created contact, as the create endpoint hands it back. 201, not 200. */
export type CreatedContact = InferResponseType<typeof $createContact, 201>;

/** One contact in full: the row, its links, and who it's related to. */
export type ContactDetail = InferResponseType<typeof $readContact, 200>;

/** A relation as the detail response reports it — already turned to face this contact. */
export type ContactRelation = ContactDetail['relations'][number];

export {
  $addContactRelation,
  $createContact,
  $deleteContact,
  $patchContact,
  $patchContactRelation,
  $removeContactRelation,
};

/**
 * The household address book. The whole query object is in the key, so each search, filter and sort
 * combination caches on its own instead of overwriting the last one — and the pickers, which pass
 * nothing, keep their own unfiltered copy.
 */
export function listContactsQueryOptions(query: ListContactsQuery = {}) {
  return queryOptions({
    queryKey: ['contacts', 'list', query],
    queryFn: async () => parseResponse($listContacts({ query })),
  });
}

/**
 * The address book as a picker reads it. `types`/`excludeId` go to the endpoint, never filtered over
 * the page — a page narrowed here can empty while more rows match, and that scroll never ends.
 */
export function listContactOptionsInfiniteQueryOptions(
  search?: string,
  filters: { excludeId?: number; types?: ListContactsQuery['types'] } = {}
) {
  return infiniteQueryOptions({
    queryKey: ['contacts', 'options', { search, ...filters }],
    queryFn: async ({ pageParam }) =>
      parseResponse($listContacts({ query: { ...filters, search, pageSize: OPTIONS_PAGE_SIZE, ...pageParam } })),
    initialPageParam: { page: 1 },
    getNextPageParam: nextPageParam,
    select: flattenOptionPages,
    staleTime: OPTIONS_STALE_TIME,
  });
}

/** One contact with its links and relations — what the detail page reads. */
export function getContactQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['contacts', id],
    queryFn: async () => parseResponse($readContact({ param: { id: String(id) } })),
  });
}

/**
 * Every contact query. Deliberately the whole prefix rather than one list: an edit can move a row
 * into or out of any filter, and a relation writes a row that *both* contacts' detail pages show.
 */
export function invalidateContacts(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['contacts'] });
}
