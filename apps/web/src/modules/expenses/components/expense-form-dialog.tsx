import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  type ExpenseCategoryChoice,
  ExpenseCategoryCombobox,
  invalidateExpenseCategories,
} from '@/modules/expense-categories';
import { DateField, parseAmount, serverMessage } from '@/modules/shared';

import { expenseAmountText } from '../expenses.helpers';
import { $createExpense, invalidateExpenses } from '../expenses.queries';

/**
 * The amount is text in the form and a number on the wire — someone typing "12,50" has to be able to
 * type the comma they were shown. Everything else is the server's own rule.
 */
const expenseFormModel = createExpenseModel.extend({ amount: expenseAmountText });

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
        <ExpenseForm defaultRecordedAt={defaultRecordedAt} onDone={() => onOpenChange(false)} />
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
      categoryId: null,
      categoryName: undefined,
      recordedAt: defaultRecordedAt,
      title: '',
    },
  });

  const { mutateAsync: create } = useMutation({
    mutationFn: async (values: ExpenseFormValues) =>
      // Non-null: `expenseAmountText` only passes for something `parseAmount` can read.
      parseResponse($createExpense({ json: { ...values, amount: parseAmount(values.amount)! } })),
  });

  const categoryId = form.watch('categoryId');
  const categoryName = form.watch('categoryName');

  const categoryChoice: ExpenseCategoryChoice = categoryName
    ? { kind: 'new', name: categoryName }
    : typeof categoryId === 'number'
      ? { kind: 'existing', id: categoryId }
      : { kind: 'none' };

  const submit: SubmitHandler<ExpenseFormValues> = async (values) => {
    try {
      await create(values);
      toast.success(`"${values.title}" added.`);
      invalidateExpenses(queryClient);

      // A named category is found-or-created by the same write, so the list may have grown.
      if (values.categoryName) {
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
        {/* `categoryId` and `categoryName` are two halves of one choice, so one control drives both:
            an existing category sets the id, a typed one sets the name for the server to
            find-or-create. */}
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <ExpenseCategoryCombobox
                  onChange={(choice) => {
                    field.onChange(choice.kind === 'existing' ? choice.id : null);
                    form.setValue('categoryName', choice.kind === 'new' ? choice.name : undefined);
                  }}
                  value={categoryChoice}
                />
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
