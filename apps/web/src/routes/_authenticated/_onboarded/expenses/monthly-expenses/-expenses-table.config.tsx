import { useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontalIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { expenseTitle } from '@homewise/server/expenses';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { type ExpenseCategoryChoice, ExpenseCategoryCombobox } from '@/modules/expense-categories';
import {
  $deleteExpense,
  type Expense,
  expenseAmountText,
  invalidateExpenses,
  useInlineExpensePatch,
} from '@/modules/expenses';
import {
  ConfirmDeleteDialog,
  DateField,
  formatAmount,
  formatDate,
  InlineCell,
  InlineCellSizer,
  inlineTriggerClassName,
  parseAmount,
  serverMessage,
} from '@/modules/shared';

/**
 * Every field an expense has is a column, and every column edits in place — that is what lets this
 * feature ship with no detail view. Each cell takes only the id it patches and the value it shows.
 */

/**
 * Where an inline control stops growing. The table is `w-full` with auto layout, so whatever width
 * the rows don't need is shared out among the columns — an amount, a date and a category name are
 * all short enough that a control filling the cell would be mostly empty box. The title is the
 * exception (`fill`): free text of no fixed length, in the column the table hands the slack to.
 */
const inlineControlClassName = 'max-w-xs';

function TitleCell({ id, title }: { id: number; title: string }) {
  const { save } = useInlineExpensePatch(id);

  return (
    <InlineCell
      ariaLabel="Title"
      display={title}
      fill
      onSave={async (next) => save({ title: next })}
      schema={expenseTitle}
      value={title}
    />
  );
}

function AmountCell({
  amount,
  currency,
  id,
  paidBack,
}: {
  amount: number;
  currency: Expense['currency'];
  id: number;
  paidBack: boolean;
}) {
  const { save } = useInlineExpensePatch(id);

  return (
    <InlineCell
      ariaLabel="Amount"
      display={formatAmount(amount, currency)}
      // The strike belongs to the resting value, not the cell: struck out around the wrapper it also
      // crosses through whatever you're typing into the editor.
      displayClassName={paidBack ? 'text-muted-foreground line-through' : undefined}
      maxWidthClassName={inlineControlClassName}
      // Non-null: `expenseAmountText` only passes for something `parseAmount` can read.
      onSave={async (next) => save({ amount: parseAmount(next)! })}
      schema={expenseAmountText}
      value={String(amount)}
    />
  );
}

function CategoryCell({ category, id, onManage }: { category: Expense['category']; id: number; onManage: () => void }) {
  const { saveOrToast } = useInlineExpensePatch(id);

  const value: ExpenseCategoryChoice = category ? { kind: 'existing', category } : { kind: 'none' };

  return (
    <ExpenseCategoryCombobox
      className={`${inlineControlClassName} ${inlineTriggerClassName}`}
      noneLabel="—"
      onChange={async (choice) => {
        if (choice.kind === 'new') {
          await saveOrToast({ categoryName: choice.name });
          return;
        }

        await saveOrToast({ categoryId: choice.kind === 'existing' ? choice.category.id : null });
      }}
      onManage={onManage}
      value={value}
    />
  );
}

function RecordedAtCell({ id, recordedAt }: { id: number; recordedAt: string }) {
  const { saveOrToast } = useInlineExpensePatch(id);

  return (
    <InlineCellSizer
      className={inlineControlClassName}
      // The raw value is the fallback only in principle — the column is a validated `date` — but the
      // sizer is what holds the width, so it must never come out empty.
      display={formatDate(recordedAt) ?? recordedAt}
      // `DateField`'s own box, not the text cells': its `Input` is `pl-3`, and `pr-10` holds the
      // space the absolutely-positioned calendar button sits in. Measured as `px-2` the button
      // would end up on top of the date.
      sizerClassName="invisible col-start-1 row-start-1 border pr-10 pl-3 text-sm"
    >
      <DateField
        allowFuture
        ariaLabel="Date"
        inline
        onChange={(next) => void saveOrToast({ recordedAt: next })}
        required
        value={recordedAt}
      />
    </InlineCellSizer>
  );
}

function RowActions({ expense }: { expense: Expense }) {
  const queryClient = useQueryClient();
  const { saveOrToast } = useInlineExpensePatch(expense.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const paidBack = Boolean(expense.paidBackAt);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`Actions for ${expense.title}`} size="icon" variant="ghost">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void saveOrToast({ paidBack: !paidBack })}>
            <Undo2Icon />
            {paidBack ? 'Mark as spent' : 'Mark as paid back'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirmingDelete(true)} variant="destructive">
            <TrashIcon />
            Delete expense
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDeleteDialog
        description={
          <>
            "{expense.title}" will be removed for good. If the money came back, mark it as paid back instead — it stays
            on the list and stops counting toward the month.
          </>
        }
        onConfirm={async () => {
          try {
            await parseResponse($deleteExpense({ param: { id: String(expense.id) } }));
            invalidateExpenses(queryClient);
          } catch (error) {
            toast.error(serverMessage(error, 'Something went wrong.'));
          }
        }}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title="Delete expense?"
      />
    </>
  );
}

const columnHelper = createColumnHelper<Expense>();

/** Takes the manage-categories handler because the picker in every row offers a way in to the sheet. */
export const expensesTableColumns = (onManageCategories: () => void) => [
  columnHelper.accessor('title', {
    cell: (info) => (
      <div className="flex items-center gap-2">
        <TitleCell id={info.row.original.id} title={info.getValue()} />
        {info.row.original.paidBackAt && <Badge variant="secondary">Paid back</Badge>}
      </div>
    ),
    header: 'Title',
  }),
  columnHelper.accessor('amount', {
    cell: (info) => (
      <AmountCell
        amount={info.getValue()}
        currency={info.row.original.currency}
        id={info.row.original.id}
        paidBack={Boolean(info.row.original.paidBackAt)}
      />
    ),
    header: 'Amount',
  }),
  columnHelper.accessor('recordedAt', {
    cell: (info) => <RecordedAtCell id={info.row.original.id} recordedAt={info.getValue()} />,
    header: 'Date',
  }),
  columnHelper.accessor('category', {
    cell: (info) => <CategoryCell category={info.getValue()} id={info.row.original.id} onManage={onManageCategories} />,
    header: 'Category',
  }),
  columnHelper.display({
    // The one cell that genuinely needs the row: the delete dialog names the expense, the menu
    // label does too, and the paid-back toggle reads the stamp.
    cell: (info) => <RowActions expense={info.row.original} />,
    header: '',
    id: 'actions',
    // One icon button wide, hard against the right edge — without this the column takes a share of
    // the table's leftover width and the button floats in the middle of it.
    meta: { className: 'w-px text-right' },
  }),
];
