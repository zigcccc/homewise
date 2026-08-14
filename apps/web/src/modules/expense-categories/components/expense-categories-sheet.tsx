import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, TagsIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { createExpenseCategoryModel } from '@homewise/server/expense-categories';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { invalidateExpenses } from '@/modules/expenses';
import { ConfirmDeleteDialog, InlineTextField, serverMessage } from '@/modules/shared';

import {
  $createExpenseCategory,
  $deleteExpenseCategory,
  $patchExpenseCategory,
  applyExpenseCategoryUpdate,
  type ExpenseCategory,
  invalidateExpenseCategories,
  listAllExpenseCategoriesQueryOptions,
} from '../expense-categories.queries';

/**
 * The category manager, as a side panel over the month it was opened from.
 *
 * Its open state is the URL: the route that renders this only exists while it should be open, which
 * is what makes the panel linkable, survive a refresh, and answer the browser's Back button. The
 * trade-off is that closing unmounts the route immediately, so the slide-out animation is skipped.
 */
export function ExpenseCategoriesSheet({ onClose, pending = false }: { onClose: () => void; pending?: boolean }) {
  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open
    >
      {/* `sm:max-w-sm` is the package default and too narrow for a list with a rename and a delete
          on every row. Widened here rather than in the kit — the sidebar is its other consumer. */}
      <SheetContent className="w-full gap-0 sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Expense categories</SheetTitle>
          <SheetDescription>
            How this household files its spending. Deleting one leaves its expenses in place, just uncategorised.
          </SheetDescription>
        </SheetHeader>
        {pending ? <Spinner className="flex-1" /> : <CategoryList />}
      </SheetContent>
    </Sheet>
  );
}

function CategoryList() {
  const queryClient = useQueryClient();
  const { data: categories } = useSuspenseQuery(listAllExpenseCategoriesQueryOptions());
  const [adding, setAdding] = useState(false);

  const { mutateAsync: create } = useMutation({
    mutationFn: async (name: string) => parseResponse($createExpenseCategory({ json: { name } })),
    onSuccess: () => invalidateExpenseCategories(queryClient),
  });

  const editor = (
    // Mounted only while adding, so `defaultValues` reseed on every open with no reset effect.
    <InlineTextField
      ariaLabel="New category name"
      cancellable
      className="h-9 w-full rounded-md border px-2 text-sm"
      defaultValue=""
      onDone={() => setAdding(false)}
      onSave={async (name) => create(name)}
      placeholder="Category name"
      schema={createExpenseCategoryModel.shape.name}
    />
  );

  // Nothing filed yet: the same empty state the rest of the app uses, with the primary action in it
  // rather than a ghost button under a one-line notice.
  if (categories.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 pt-0">
        {adding ? (
          editor
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TagsIcon />
              </EmptyMedia>
              <EmptyTitle>No categories yet</EmptyTitle>
              <EmptyDescription>
                Add the ones this household actually thinks in — "Groceries", "Kindergarten", "The dog".
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAdding(true)}>
                <PlusIcon />
                Add category
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 pt-0">
      {categories.map((category) => (
        <CategoryRow category={category} key={category.id} />
      ))}

      {adding ? (
        editor
      ) : (
        <Button className="justify-start" onClick={() => setAdding(true)} variant="ghost">
          <PlusIcon />
          Add category
        </Button>
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: ExpenseCategory }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { mutateAsync: rename } = useMutation({
    mutationFn: async (name: string) =>
      parseResponse($patchExpenseCategory({ json: { name }, param: { id: String(category.id) } })),
    onSuccess: (updated) => {
      applyExpenseCategoryUpdate(queryClient, updated);
      invalidateExpenseCategories(queryClient);
      // The expense table shows this name off the join, so a rename relabels rows there too.
      invalidateExpenses(queryClient);
    },
  });

  const { mutateAsync: remove } = useMutation({
    mutationFn: async () => parseResponse($deleteExpenseCategory({ param: { id: String(category.id) } })),
    onSuccess: () => {
      invalidateExpenseCategories(queryClient);
      // Every expense filed here just became uncategorised, and the breakdown lost a slice.
      invalidateExpenses(queryClient);
    },
  });

  const usage = `${category.expenseCount} ${category.expenseCount === 1 ? 'expense' : 'expenses'}`;

  if (editing) {
    return (
      <InlineTextField
        ariaLabel="Category name"
        cancellable
        className="h-9 w-full rounded-md border px-2 text-sm"
        defaultValue={category.name}
        onDone={() => setEditing(false)}
        onSave={async (name) => rename(name)}
        schema={createExpenseCategoryModel.shape.name}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{category.name}</p>
        <p className="text-muted-foreground text-xs">{usage}</p>
      </div>
      <Button aria-label={`Rename ${category.name}`} onClick={() => setEditing(true)} size="icon" variant="ghost">
        <PencilIcon />
      </Button>
      <Button
        aria-label={`Delete ${category.name}`}
        onClick={() => setConfirmingDelete(true)}
        size="icon"
        variant="ghost"
      >
        <TrashIcon />
      </Button>

      <ConfirmDeleteDialog
        description={
          <>
            "{category.name}" will be removed. The {usage} filed under it stay — they just become uncategorised.
          </>
        }
        onConfirm={async () => {
          try {
            await remove();
          } catch (error) {
            toast.error(serverMessage(error, 'Something went wrong.'));
          }
        }}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title="Delete category?"
      />
    </div>
  );
}
