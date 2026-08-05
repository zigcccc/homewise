import { useSuspenseQuery } from '@tanstack/react-query';
import { PlusIcon, SettingsIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Combobox,
  ComboboxAction,
  ComboboxContent,
  ComboboxFieldTrigger,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from '@homewise/ui/core';

import { listExpenseCategoriesQueryOptions } from '../expense-categories.queries';

/**
 * What the picker hands back: an existing category, one that doesn't exist yet, or none at all.
 *
 * The two halves map onto the expense payload's `categoryId` / `categoryName` — which is why a new
 * name travels as a name rather than as an id this component minted.
 */
export type ExpenseCategoryChoice = { kind: 'existing'; id: number } | { kind: 'new'; name: string } | { kind: 'none' };

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
  const [search, setSearch] = useState('');

  const { data: categories } = useSuspenseQuery(listExpenseCategoriesQueryOptions());

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? categories.filter((category) => category.name.toLowerCase().includes(query)) : categories),
    [categories, query]
  );

  // An exact name match means "Create" would resolve to that row anyway — offer it directly.
  const hasExactMatch = categories.some((category) => category.name.toLowerCase() === query);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const select = (choice: ExpenseCategoryChoice) => {
    onChange(choice);
    close();
  };

  const chosen = value.kind === 'existing' ? categories.find((category) => category.id === value.id) : undefined;
  // Falls back to the placeholder when an id no longer resolves — a category deleted in another tab.
  const isPlaceholder = value.kind === 'none' || (value.kind === 'existing' && !chosen);

  const label = () => {
    if (value.kind === 'new') {
      return value.name;
    }

    return chosen?.name ?? noneLabel;
  };

  return (
    <Combobox
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch('');
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
          {label()}
        </span>
      </ComboboxFieldTrigger>
      <ComboboxContent className="min-w-64" shouldFilter={false}>
        <ComboboxInput onValueChange={setSearch} placeholder="Search categories…" value={search} />
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxItem onSelect={() => select({ kind: 'none' })} value="none">
              {noneLabel}
            </ComboboxItem>
          </ComboboxGroup>
          {filtered.length > 0 && (
            <ComboboxGroup heading="Your categories">
              {filtered.map((category) => (
                <ComboboxItem
                  key={category.id}
                  onSelect={() => select({ kind: 'existing', id: category.id })}
                  value={String(category.id)}
                >
                  <span className="truncate">{category.name}</span>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          )}
          {/* Both rows are `ComboboxAction`s rather than `ComboboxItem`s, so they sit outside cmdk's
              item registry and survive filtering — "Create" has to show up precisely when the search
              matches nothing, and "Edit categories" should never disappear. */}
          {(query && !hasExactMatch) || onManage ? <ComboboxSeparator /> : null}
          {query && !hasExactMatch && (
            <ComboboxAction onClick={() => select({ kind: 'new', name: search.trim() })}>
              <PlusIcon />
              Create "{search.trim()}"
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
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
