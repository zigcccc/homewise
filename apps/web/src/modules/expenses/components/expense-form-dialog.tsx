import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Suspense } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { createExpenseModel } from '@homewise/server/expenses';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  ExpenseCategoryCombobox,
  expenseCategoryChoiceModel,
  invalidateExpenseCategories,
} from '@/modules/expense-categories';
import { DateField, parseAmount, serverMessage } from '@/modules/shared';

import { expenseAmountText } from '../expenses.helpers';
import { $createExpense, invalidateExpenses } from '../expenses.queries';

/**
 * The amount is text in the form and a number on the wire — someone typing "12,50" has to be able to
 * type the comma they were shown. `categoryId` and `categoryName` are two halves of one choice, so
 * the form holds the choice and `create` writes both from it. Everything else is the server's own rule.
 */
const expenseFormModel = createExpenseModel.omit({ categoryId: true, categoryName: true }).extend({
  amount: expenseAmountText,
  category: expenseCategoryChoiceModel,
});

type ExpenseFormValues = z.infer<typeof expenseFormModel>;

/**
 * Logs a new expense. There is no edit variant: every field an expense has is a column in the table,
 * and each one edits in place there — a dialog would only repeat them.
 *
 * The form body is mounted inside `DialogContent`, which Radix unmounts on close, so `defaultValues`
 * reseed on every open with no reset effect.
 */
export function ExpenseFormDialog({
  defaultRecordedAt,
  onOpenChange,
  open,
}: {
  /** The month being viewed, so logging into August while looking at August doesn't need a date fix. */
  defaultRecordedAt: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Date it when the money actually moved — it doesn't have to be today.</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<Spinner className="min-h-64" />}>
          <ExpenseForm defaultRecordedAt={defaultRecordedAt} onDone={() => onOpenChange(false)} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({ defaultRecordedAt, onDone }: { defaultRecordedAt: string; onDone: () => void }) {
  const queryClient = useQueryClient();

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormModel),
    defaultValues: {
      amount: '',
      category: { kind: 'none' },
      recordedAt: defaultRecordedAt,
      title: '',
    },
  });

  const { mutateAsync: create } = useMutation({
    mutationFn: async ({ amount, category, ...values }: ExpenseFormValues) =>
      parseResponse(
        $createExpense({
          json: {
            ...values,
            // Non-null: `expenseAmountText` only passes for something `parseAmount` can read.
            amount: parseAmount(amount)!,
            categoryId: category.kind === 'existing' ? category.category.id : null,
            categoryName: category.kind === 'new' ? category.name : undefined,
          },
        })
      ),
  });

  const submit: SubmitHandler<ExpenseFormValues> = async (values) => {
    try {
      await create(values);
      toast.success(`"${values.title}" added.`);
      invalidateExpenses(queryClient);

      // A named category is found-or-created by the same write, so the list may have grown.
      if (values.category.kind === 'new') {
        invalidateExpenseCategories(queryClient);
      }

      onDone();
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Weekly shop" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  {/* Text, not `type="number"`: a number input refuses the decimal comma this app
                      renders amounts with, so you couldn't type back what you were shown. */}
                  <Input {...field} inputMode="decimal" placeholder="12,50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recordedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <DateField allowFuture onChange={field.onChange} value={field.value} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <ExpenseCategoryCombobox onChange={field.onChange} value={field.value} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            Add expense
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
