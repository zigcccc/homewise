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
import { cn } from '@homewise/ui/lib';

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
  InlineTextField,
  parseAmount,
  serverMessage,
} from '@/modules/shared';

/**
 * Every field an expense has is a column, and every column edits in place — that is what lets this
 * feature ship with no detail view. Each cell takes only the id it patches and the value it shows.
 */

/**
 * Where an inline control stops growing.
 *
 * The table is `w-full` with auto layout, so whatever width the rows don't need is shared out among
 * the columns — with only five short columns here that is a lot, and a control set to fill its cell
 * becomes a 1300px box to type "Weekly shop" into. The cell keeps the slack; the control doesn't.
 */
const inlineControlClassName = 'max-w-xs';

const inlineTriggerClassName = `${inlineControlClassName} w-full justify-between border-transparent px-2 shadow-none not-disabled:cursor-pointer hover:bg-accent focus-visible:border-ring data-[state=open]:border-input data-[state=open]:bg-accent [&_svg]:opacity-0 hover:[&_svg]:opacity-60 focus-visible:[&_svg]:opacity-60 data-[state=open]:[&_svg]:opacity-60`;

const inlineTextClassName = 'h-9 w-full rounded-md border px-2 text-sm';

/**
 * A hidden copy of the value, sharing the controls' horizontal box, that holds the column open. An
 * `<input>` contributes nothing to an auto-layout table's width once it carries `size={1}`, so
 * without this the column would collapse the moment the editor opened.
 */
const inlineSizerClassName = 'invisible col-start-1 row-start-1 border px-2 text-sm';

/**
 * The date's sizer mirrors `DateField`'s own box instead: its `Input` is `pl-3`, and `pr-10` holds
 * the space the absolutely-positioned calendar button sits in. Measure it as `px-2` and the button
 * ends up on top of the date.
 */
const inlineDateSizerClassName = 'invisible col-start-1 row-start-1 border pr-10 pl-3 text-sm';

// `flex items-center` because the resting box is `h-9` and its text would otherwise sit at the top,
// half a line above where the editor puts it.
const inlineButtonClassName = `${inlineTextClassName} col-start-1 row-start-1 flex items-center border-transparent text-left hover:bg-accent`;

/** Click-to-edit text, over a sizer that stops the column resizing as the editor opens and closes. */
function InlineCell({
  ariaLabel,
  display,
  displayClassName,
  onSave,
  schema,
  value,
}: {
  ariaLabel: string;
  display: string;
  /** Styling for the resting value only — never for the editor, which has to stay legible. */
  displayClassName?: string;
  onSave: (next: string) => Promise<unknown>;
  schema: Parameters<typeof InlineTextField>[0]['schema'];
  value: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    // `min-w-0 flex-1` for the title cell, where this grid is a flex item beside the paid-back badge:
    // without them it shrinks to max-content and the editor opens as a box hugging the text instead
    // of growing to a usable width. Both are inert everywhere else.
    <div className={`grid min-w-0 flex-1 grid-cols-1 ${inlineControlClassName}`}>
      <span className={inlineSizerClassName}>{display}</span>
      {editing ? (
        // Mounted only while editing, so `defaultValues` reseed on every open with no reset effect.
        <InlineTextField
          ariaLabel={ariaLabel}
          className={`${inlineTextClassName} col-start-1 row-start-1`}
          defaultValue={value}
          onDone={() => setEditing(false)}
          onSave={onSave}
          schema={schema}
        />
      ) : (
        // Labelled rather than named by its content: the amount cell's text is a formatted currency
        // string, which is no way to find a control.
        <button
          aria-label={`Edit ${ariaLabel.toLowerCase()}`}
          className={cn(inlineButtonClassName, displayClassName)}
          onClick={() => setEditing(true)}
          type="button"
        >
          {display}
        </button>
      )}
    </div>
  );
}

function TitleCell({ expense }: { expense: Expense }) {
  const { save } = useInlineExpensePatch(expense.id);

  return (
    <InlineCell
      ariaLabel="Title"
      display={expense.title}
      onSave={async (title) => save({ title })}
      schema={expenseTitle}
      value={expense.title}
    />
  );
}

function AmountCell({ expense }: { expense: Expense }) {
  const { save } = useInlineExpensePatch(expense.id);

  return (
    <InlineCell
      ariaLabel="Amount"
      display={formatAmount(expense.amount, expense.currency)}
      // The strike belongs to the resting value, not the cell: struck out around the wrapper it also
      // crosses through whatever you're typing into the editor.
      displayClassName={expense.paidBackAt ? 'text-muted-foreground line-through' : undefined}
      // Non-null: `expenseAmountText` only passes for something `parseAmount` can read.
      onSave={async (amount) => save({ amount: parseAmount(amount)! })}
      schema={expenseAmountText}
      value={String(expense.amount)}
    />
  );
}

function CategoryCell({ expense, onManage }: { expense: Expense; onManage: () => void }) {
  const { saveOrToast } = useInlineExpensePatch(expense.id);

  const value: ExpenseCategoryChoice = expense.category
    ? { kind: 'existing', id: expense.category.id }
    : { kind: 'none' };

  return (
    <ExpenseCategoryCombobox
      className={inlineTriggerClassName}
      noneLabel="—"
      onChange={async (choice) => {
        if (choice.kind === 'new') {
          await saveOrToast({ categoryName: choice.name });
          return;
        }

        await saveOrToast({ categoryId: choice.kind === 'existing' ? choice.id : null });
      }}
      onManage={onManage}
      value={value}
    />
  );
}

function RecordedAtCell({ expense }: { expense: Expense }) {
  const { saveOrToast } = useInlineExpensePatch(expense.id);

  return (
    // Same grid-over-sizer arrangement as the text cells: `DateField` carries `size={1}`, so the
    // rendered date is what has to hold the column open.
    <div className={`grid grid-cols-1 ${inlineControlClassName}`}>
      <span className={inlineDateSizerClassName}>{formatDate(expense.recordedAt)}</span>
      <div className="col-start-1 row-start-1">
        <DateField
          allowFuture
          id={`expense-${expense.id}-recorded-at`}
          inline
          onChange={(recordedAt) => void saveOrToast({ recordedAt })}
          required
          value={expense.recordedAt}
        />
      </div>
    </div>
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
        <TitleCell expense={info.row.original} />
        {info.row.original.paidBackAt && <Badge variant="secondary">Paid back</Badge>}
      </div>
    ),
    header: 'Title',
  }),
  columnHelper.accessor('amount', {
    cell: (info) => <AmountCell expense={info.row.original} />,
    header: 'Amount',
  }),
  columnHelper.accessor('recordedAt', {
    cell: (info) => <RecordedAtCell expense={info.row.original} />,
    header: 'Date',
  }),
  columnHelper.accessor('category', {
    cell: (info) => <CategoryCell expense={info.row.original} onManage={onManageCategories} />,
    header: 'Category',
  }),
  columnHelper.display({
    cell: (info) => <RowActions expense={info.row.original} />,
    header: '',
    id: 'actions',
    // One icon button wide, hard against the right edge — without this the column takes a share of
    // the table's leftover width and the button floats in the middle of it.
    meta: { className: 'w-px text-right' },
  }),
];
