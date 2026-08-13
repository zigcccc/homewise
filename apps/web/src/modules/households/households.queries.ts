import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { client, parseResponse } from '@/api/client';

export function getMyHouseholdQueryOptions() {
  return queryOptions({
    queryKey: ['households', 'my'],
    queryFn: async () => {
      const res = await client.households.my.$get();

      if (!res.ok) {
        throw new Error(res.statusText, { cause: res.status });
      }

      return res.json();
    },
  });
}

export function getReadHouseholdInviteQueryOptions(token: string) {
  return queryOptions({
    queryKey: ['households', 'invites', token],
    queryFn: async () => {
      const res = await client.households.invite.$get({ query: { token } });

      if (!res.ok) {
        throw new Error(res.statusText, { cause: res.status });
      }

      return res.json();
    },
  });
}

export function listMyHouseholdActiveInvitesQueryOptions() {
  return queryOptions({
    queryKey: ['households', 'activeInvites', 'list'],
    queryFn: async () => parseResponse(client.households.my.invites.active.$get()),
  });
}

/**
 * The household, its members and its open invites — all three keys under one prefix.
 *
 * Deliberately the whole prefix: adding a member, accepting an invite and renaming the household all
 * change what the members page and the sidebar show, and none of them is addressed by a single key.
 */
export function invalidateHouseholds(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['households'] });
}
