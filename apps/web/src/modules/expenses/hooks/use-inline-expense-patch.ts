import { useMutation, useQueryClient } from '@tanstack/react-query';

import { parseResponse } from '@/api/client';
import { invalidateExpenseCategories } from '@/modules/expense-categories';
import { useInlinePatch } from '@/modules/shared';

import { $patchExpense, applyExpenseUpdate, invalidateExpenses, type PatchExpensePayload } from '../expenses.queries';

/** Patching one expense from the table — the category picker and the paid-back toggle included. */
export function useInlineExpensePatch(expenseId: number) {
  const queryClient = useQueryClient();

  return useInlinePatch(
    'expenses',
    useMutation({
      mutationFn: async (json: PatchExpensePayload) =>
        parseResponse($patchExpense({ json, param: { id: String(expenseId) } })),
      onSuccess: (updated, json) => {
        applyExpenseUpdate(queryClient, updated);
        invalidateExpenses(queryClient);

        // Naming a category found-or-creates it as part of the same write, so the list may have grown.
        if (json.categoryName) {
          invalidateExpenseCategories(queryClient);
        }
      },
    })
  );
}
