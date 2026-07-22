import { queryOptions } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listEntries = client['child-dictionaries'][':id'].entries.$get;
export type ListEntriesQuery = InferRequestType<typeof $listEntries>['query'];

export function listChildDictionaryEntriesQueryOptions(id: number, query: ListEntriesQuery) {
  return queryOptions({
    queryKey: ['child-dictionaries', id, 'entries', query],
    queryFn: async () => parseResponse($listEntries({ param: { id: id.toString() }, query })),
  });
}
