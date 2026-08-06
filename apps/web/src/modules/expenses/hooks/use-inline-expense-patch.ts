import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { invalidateExpenseCategories } from '@/modules/expense-categories';
import { serverMessage } from '@/modules/shared';

import { $patchExpense, applyExpenseUpdate, invalidateExpenses, type PatchExpensePayload } from '../expenses.queries';

/**
 * Patching one expense from the table.
 *
 * Two ways to call it, matching the two kinds of control in the row: `save` throws, for the
 * `InlineTextField`s that have a field to hang the message on; `saveOrToast` swallows into a toast,
 * for the live controls (the category picker, the paid-back toggle) that have no form and no message
 * slot.
 */
export function useInlineExpensePatch(expenseId: number) {
  const queryClient = useQueryClient();

  const { isPending, mutateAsync: save } = useMutation({
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
  });

  const saveOrToast = async (json: PatchExpensePayload) => {
    try {
      await save(json);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}
