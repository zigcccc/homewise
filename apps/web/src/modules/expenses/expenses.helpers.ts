export const expensesBaseQueryKey = 'expenses';

export const generateKeys = {
  list: () => [expensesBaseQueryKey, 'list'],
} as const;
