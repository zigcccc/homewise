import { PlusIcon, SettingsIcon } from 'lucide-react';
import { useState } from 'react';

import {
  Combobox,
  ComboboxAction,
  ComboboxFieldTrigger,
  ComboboxGroup,
  ComboboxItem,
  ComboboxSeparator,
} from '@homewise/ui/core';

import { AsyncComboboxContent, shouldOfferCreate, useAsyncOptions } from '@/modules/shared';

import { listExpenseCategoryOptionsInfiniteQueryOptions } from '../expense-categories.queries';

/**
 * What the picker hands back: an existing category, one that doesn't exist yet, or none at all.
 *
 * The two halves map onto the expense payload's `categoryId` / `categoryName` — which is why a new
 * name travels as a name rather than as an id this component minted. It travels as `{ id, name }`
 * because the list is paged now, and an id alone can no longer be labelled from it.
 */
export type ExpenseCategoryChoice =
  | { kind: 'existing'; category: { id: number; name: string } }
  | { kind: 'new'; name: string }
  | { kind: 'none' };

/**
 * Picks the category an expense is filed under, or names one that doesn't exist yet.
 *
 * A new name is *not* created here — it travels with the expense payload and is found-or-created when
 * the expense is saved, so abandoning the form leaves nothing behind. That makes this a pure picker
 * with no mutation of its own, exactly like `StoreCombobox`, which this is modelled on.
 *
 * `ComboboxFieldTrigger` rather than `ComboboxTrigger`: this is a form field and should be
 * indistinguishable from a closed `Select`. That's also what lets the table drop its inline-cell
 * classes on top through `className`.
 */
export function ExpenseCategoryCombobox({
  ariaLabel = 'Category',
  className,
  disabled,
  noneLabel = 'None',
  onChange,
  onManage,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** How "uncategorised" reads. "None" in a form; "—" where the value sits in a table. */
  noneLabel?: string;
  onChange: (choice: ExpenseCategoryChoice) => void;
  /**
   * Opens the category manager. Renders the "Edit categories" row only when given — the add-expense
   * dialog omits it, because navigating to the sheet from under an open dialog would strand a
   * half-filled form, and typing a new name in here already covers what you'd go there to do.
   */
  onManage?: () => void;
  value: ExpenseCategoryChoice;
}) {
  const [open, setOpen] = useState(false);
  const options = useAsyncOptions({ enabled: open, queryOptions: listExpenseCategoryOptionsInfiniteQueryOptions });

  const offerCreate = shouldOfferCreate(options);

  const close = () => {
    setOpen(false);
    options.reset();
  };

  const select = (choice: ExpenseCategoryChoice) => {
    onChange(choice);
    close();
  };

  const isPlaceholder = value.kind === 'none';
  const label = value.kind === 'none' ? noneLabel : value.kind === 'new' ? value.name : value.category.name;

  return (
    <Combobox
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          options.reset();
        }
      }}
      open={open}
    >
      {/* `data-slot`/`data-placeholder` are what `selectTriggerClassName`'s truncation and muted
          placeholder rules key off; Radix sets them on a `Select` and on nothing else. */}
      <ComboboxFieldTrigger
        aria-label={ariaLabel}
        className={className}
        data-placeholder={isPlaceholder || undefined}
        disabled={disabled}
        type="button"
      >
        <span className="truncate" data-slot="select-value">
          {label}
        </span>
      </ComboboxFieldTrigger>
      <AsyncComboboxContent
        action={
          /* Both rows are `ComboboxAction`s rather than `ComboboxItem`s, so they sit outside cmdk's
             item registry — "Create" has to show up precisely when the search matches nothing, and
             "Edit categories" should never disappear. */
          (offerCreate || onManage) && (
            <>
              <ComboboxSeparator />
              {offerCreate && (
                <ComboboxAction onClick={() => select({ kind: 'new', name: options.search.trim() })}>
                  <PlusIcon />
                  Create "{options.search.trim()}"
                </ComboboxAction>
              )}
              {onManage && (
                <ComboboxAction
                  onClick={() => {
                    // Closed first: the sheet mounts its own focus trap, and two of them fight.
                    close();
                    onManage();
                  }}
                >
                  <SettingsIcon />
                  Edit categories
                </ComboboxAction>
              )}
            </>
          )
        }
        className="min-w-64"
        emptyMessage={options.search ? 'No matching categories.' : 'No categories yet.'}
        isEmpty={options.items.length === 0}
        options={options}
        placeholder="Search categories…"
      >
        <ComboboxGroup>
          <ComboboxItem onSelect={() => select({ kind: 'none' })} value="none">
            {noneLabel}
          </ComboboxItem>
        </ComboboxGroup>
        {options.items.length > 0 && (
          <ComboboxGroup heading="Your categories">
            {options.items.map((category) => (
              <ComboboxItem
                key={category.id}
                onSelect={() => select({ kind: 'existing', category })}
                value={String(category.id)}
              >
                <span className="truncate">{category.name}</span>
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        )}
      </AsyncComboboxContent>
    </Combobox>
  );
}
