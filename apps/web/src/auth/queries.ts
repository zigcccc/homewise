import { queryOptions } from '@tanstack/react-query';

import { authClient } from './client';

export function getSessionQueryOptions() {
  return queryOptions({
    queryKey: ['auth', 'session'],
    queryFn: async () => authClient.getSession(),
    staleTime: 1000 * 60 * 5,
  });
}
