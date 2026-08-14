import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Button,
  Combobox,
  ComboboxAction,
  ComboboxGroup,
  ComboboxItem,
  ComboboxSeparator,
  ComboboxTrigger,
} from '@homewise/ui/core';

import { AsyncComboboxContent, shouldOfferCreate, useAsyncOptions } from '@/modules/shared';

import { ingredientCategoryLabels } from '../helpers';
import { type Ingredient, listIngredientOptionsInfiniteQueryOptions } from '../ingredients.queries';

/** What the picker hands back: an existing library row, or a name that doesn't exist yet. */
export type IngredientChoice = { kind: 'existing'; ingredient: Ingredient } | { kind: 'new'; name: string };

/**
 * Picks an ingredient out of the household library, or names a new one.
 *
 * A new name is *not* created here — it travels with the recipe payload and is found-or-created when
 * the recipe is saved, so abandoning a draft leaves nothing behind. That makes this a pure picker
 * with no mutation of its own.
 *
 * Unlike the contact picker, ingredients already on the recipe stay selectable — butter legitimately
 * appears in both the dough and the sauce section, so disabling used ones would block a real case.
 *
 * The "Create" row is a `ComboboxAction` rather than a `ComboboxItem` so it survives cmdk's filtering
 * and stays visible precisely when the search matches nothing.
 */
export function IngredientCombobox({
  actionLabel,
  label = 'Add ingredient',
  meta = 'category',
  onSelect,
  usedIds,
}: {
  actionLabel?: string;
  label?: string;
  meta?: 'category' | 'store';
  onSelect: (choice: IngredientChoice) => void;
  usedIds?: number[];
}) {
  const [open, setOpen] = useState(false);
  const options = useAsyncOptions({ enabled: open, queryOptions: listIngredientOptionsInfiniteQueryOptions });

  const used = useMemo(() => new Set(usedIds), [usedIds]);

  const offerCreate = shouldOfferCreate(options);

  const close = () => {
    setOpen(false);
    options.reset();
  };
  const handleSelect = (ingredient: Ingredient) => {
    onSelect({ kind: 'existing', ingredient });
    close();
  };
  const handleCreate = () => {
    onSelect({ kind: 'new', name: options.search.trim() });
    close();
  };

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
      <ComboboxTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <PlusIcon />
          {label}
        </Button>
      </ComboboxTrigger>
      <AsyncComboboxContent
        action={
          offerCreate && (
            <>
              <ComboboxSeparator />
              <ComboboxAction onClick={handleCreate}>
                <PlusIcon />
                {actionLabel ?? 'Create'} "{options.search.trim()}"
              </ComboboxAction>
            </>
          )
        }
        align="start"
        className="w-72"
        emptyMessage={options.search ? 'No matching ingredients.' : 'No ingredients yet.'}
        options={options}
        placeholder="Search ingredients…"
      >
        {(items) => (
          <ComboboxGroup heading="Your ingredients">
            {items.map((ingredient) => (
              <ComboboxItem
                disabled={used.has(ingredient.id)}
                key={ingredient.id}
                onSelect={() => handleSelect(ingredient)}
                value={String(ingredient.id)}
              >
                <span className="truncate">{ingredient.name}</span>
                <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                  {used.has(ingredient.id)
                    ? 'Already added'
                    : meta === 'store'
                      ? ingredient.store?.name
                      : ingredientCategoryLabels[ingredient.category]}
                </span>
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        )}
      </AsyncComboboxContent>
    </Combobox>
  );
}
