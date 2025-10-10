import { Button } from '@homewise/ui/core/button';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { client } from '@/api/client';
import { generateKeys, getListExpensesQueryOptions } from '@/modules/expenses';

export const Route = createFileRoute('/_authenticated/')({
  component: HomeRoute,
  pendingComponent: () => <p>Loading...</p>,
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getListExpensesQueryOptions());
  },
});

function HomeRoute() {
  const { queryClient } = Route.useRouteContext();
  const { data: expenses } = useSuspenseQuery(getListExpensesQueryOptions());
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async ({ name, amount }: { name: string; amount: number }) =>
      client.expenses.$post({ json: { name, amount } }),
  });

  const handleAddExpense = async () => {
    await mutateAsync({ name: 'Test expense', amount: 10.24 });
    queryClient.invalidateQueries({ queryKey: generateKeys.list() });
  };

  return (
    <div>
      <h1>Hello Homewise!</h1>
      <div className="mt-4">
        <h2>Your current expenses:</h2>
        <div className="flex flex-col gap-3">
          {expenses.data.map((expense) => (
            <div key={expense.id} className="flex items-center gap-2">
              <span>{expense.name}</span>
              <span>{expense.amount}</span>
            </div>
          ))}
        </div>
        <Button loading={isPending} onClick={handleAddExpense}>
          Create test expense
        </Button>
      </div>
    </div>
  );
}
