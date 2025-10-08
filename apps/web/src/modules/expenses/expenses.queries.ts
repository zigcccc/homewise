import { queryOptions } from '@tanstack/react-query';

import { client } from '@/api/client';

import { generateKeys } from './expenses.helpers';

export function getListExpensesQueryOptions() {
  return queryOptions({
    queryKey: generateKeys.list(),
    queryFn: async () => {
      const res = await client.expenses.$get();
      return res.json();
    },
  });
}
