import { PlusIcon } from 'lucide-react';
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

import { listStoreOptionsInfiniteQueryOptions } from '../stores.queries';

/** The chosen shop travels as `{ id, name }`: the list is paged, so an id alone can't be labelled. */
export type StoreChoice =
  | { kind: 'existing'; store: { id: number; name: string } }
  | { kind: 'new'; name: string }
  | { kind: 'none' };

/**
 * Picks the shop an ingredient is bought at, or names one that doesn't exist yet.
 *
 * A new name is *not* created here — it travels with the ingredient payload and is found-or-created
 * when the ingredient is saved, so an abandoned dialog leaves nothing behind.
 *
 * `ComboboxFieldTrigger` rather than `ComboboxTrigger`: this is a form field and should be
 * indistinguishable from a closed `Select`.
 *
 * The "Create" row is a `ComboboxAction` rather than a `ComboboxItem` so it survives cmdk's filtering
 * and stays visible precisely when the search matches nothing.
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
  noneLabel?: string;
  onChange: (choice: StoreChoice) => void;
  value: StoreChoice;
}) {
  const [open, setOpen] = useState(false);
  const options = useAsyncOptions({ enabled: open, queryOptions: listStoreOptionsInfiniteQueryOptions });

  const offerCreate = shouldOfferCreate(options);

  const select = (choice: StoreChoice) => {
    onChange(choice);
    setOpen(false);
    options.reset();
  };

  const isPlaceholder = value.kind === 'none';
  const label = value.kind === 'none' ? noneLabel : value.kind === 'new' ? value.name : value.store.name;

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
      {/* Content defaults to the trigger's width, which is fine for a form field but far too narrow
          for a table cell — the floor keeps the search input usable in both. */}
      <AsyncComboboxContent
        action={
          offerCreate && (
            <>
              <ComboboxSeparator />
              <ComboboxAction onClick={() => select({ kind: 'new', name: options.search.trim() })}>
                <PlusIcon />
                Create "{options.search.trim()}"
              </ComboboxAction>
            </>
          )
        }
        className="min-w-64"
        emptyMessage={options.search ? 'No matching shops.' : 'No shops yet.'}
        isEmpty={options.items.length === 0}
        options={options}
        placeholder="Search shops…"
      >
        <ComboboxGroup>
          <ComboboxItem onSelect={() => select({ kind: 'none' })} value="none">
            {noneLabel}
          </ComboboxItem>
        </ComboboxGroup>
        {options.items.length > 0 && (
          <ComboboxGroup heading="Your shops">
            {options.items.map((store) => (
              <ComboboxItem
                key={store.id}
                onSelect={() => select({ kind: 'existing', store })}
                value={String(store.id)}
              >
                <span className="truncate">{store.name}</span>
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        )}
      </AsyncComboboxContent>
    </Combobox>
  );
}
