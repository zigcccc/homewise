import { queryOptions } from '@tanstack/react-query';

import { client } from '@/api/client';

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
