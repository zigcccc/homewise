import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { getListExpensesQueryOptions } from '@/modules/expenses';

export const Route = createFileRoute('/')({
  component: HomeRoute,
  pendingComponent: () => <p>Loading...</p>,
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getListExpensesQueryOptions());
  },
});

function HomeRoute() {
  const { data: expenses } = useSuspenseQuery(getListExpensesQueryOptions());

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
      </div>
    </div>
  );
}
