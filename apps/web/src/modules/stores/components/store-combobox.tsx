import { useSuspenseQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
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

import { listStoresQueryOptions } from '../stores.queries';

/**
 * What the picker hands back: an existing shop, a shop that doesn't exist yet, or none at all.
 *
 * The two halves map onto the ingredient payload's `storeId` / `storeName` — which is why a new name
 * travels as a name rather than as an id this component minted.
 */
export type StoreChoice = { kind: 'existing'; id: number } | { kind: 'new'; name: string } | { kind: 'none' };

/**
 * Picks the shop an ingredient is bought at, or names one that doesn't exist yet.
 *
 * A new name is *not* created here — it travels with the ingredient payload and is found-or-created
 * when the ingredient is saved, so abandoning the dialog leaves nothing behind and a shop can't
 * outlive a save that then fails on a duplicate ingredient name. That makes this a pure picker with
 * no mutation of its own, exactly like `IngredientCombobox`.
 *
 * `ComboboxFieldTrigger` rather than `ComboboxTrigger`: this is a form field and should be
 * indistinguishable from a closed `Select`, not an action button that opens a picker. That's also
 * what lets the table drop its inline-cell classes on top through `className` and get a control that
 * reads as plain table text until you reach for it — the same string the `Select` cells use.
 *
 * The "Create" row is a `ComboboxAction` rather than a `ComboboxItem` so it survives cmdk's
 * filtering and stays visible precisely when the search matches nothing.
 */
export function StoreCombobox({
  ariaLabel = 'Shop',
  className,
  disabled,
  noneLabel = 'None',
  onChange,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** How "no shop" reads. "None" in a form; "—" where the value sits in a table. */
  noneLabel?: string;
  onChange: (choice: StoreChoice) => void;
  value: StoreChoice;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: stores } = useSuspenseQuery(listStoresQueryOptions());

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? stores.filter((store) => store.name.toLowerCase().includes(query)) : stores),
    [query, stores]
  );

  // An exact name match means "Create" would resolve to that row anyway — offer it directly.
  const hasExactMatch = stores.some((store) => store.name.toLowerCase() === query);

  const select = (choice: StoreChoice) => {
    onChange(choice);
    setOpen(false);
    setSearch('');
  };

  const chosen = value.kind === 'existing' ? stores.find((store) => store.id === value.id) : undefined;
  // Falls back to the placeholder when an id no longer resolves — a shop deleted in another tab.
  const isPlaceholder = value.kind === 'none' || (value.kind === 'existing' && !chosen);

  const label = () => {
    if (value.kind === 'new') return value.name;

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
      {/* Content defaults to the trigger's width, which is fine for a form field but far too narrow
          for a table cell — the floor keeps the search input usable in both. */}
      <ComboboxContent className="min-w-64" shouldFilter={false}>
        <ComboboxInput onValueChange={setSearch} placeholder="Search shops…" value={search} />
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxItem onSelect={() => select({ kind: 'none' })} value="none">
              {noneLabel}
            </ComboboxItem>
          </ComboboxGroup>
          {filtered.length > 0 && (
            <ComboboxGroup heading="Your shops">
              {filtered.map((store) => (
                <ComboboxItem
                  key={store.id}
                  onSelect={() => select({ kind: 'existing', id: store.id })}
                  value={String(store.id)}
                >
                  <span className="truncate">{store.name}</span>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          )}
          {query && !hasExactMatch && (
            <>
              <ComboboxSeparator />
              <ComboboxAction onClick={() => select({ kind: 'new', name: search.trim() })}>
                <PlusIcon />
                Create "{search.trim()}"
              </ComboboxAction>
            </>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
