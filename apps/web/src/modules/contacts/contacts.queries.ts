import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { client, parseResponse } from '@/api/client';

/** The household address book — every contact, for the picker. */
export function listContactsQueryOptions() {
  return queryOptions({
    queryKey: ['contacts', 'list'],
    queryFn: async () => parseResponse(client.contacts.$get()),
  });
}

/** Refreshes the household contacts list (picker) after a contact is created or edited. */
export function invalidateContacts(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['contacts', 'list'], exact: true });
}
