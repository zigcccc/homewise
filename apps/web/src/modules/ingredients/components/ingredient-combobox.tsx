import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Button,
  Combobox,
  ComboboxAction,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from '@homewise/ui/core';

import { ingredientCategoryLabels } from '../helpers';
import { type Ingredient } from '../ingredients.queries';

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
  ingredients,
  label = 'Add ingredient',
  onSelect,
}: {
  ingredients: Ingredient[];
  label?: string;
  onSelect: (choice: IngredientChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? ingredients.filter((item) => item.name.toLowerCase().includes(query)) : ingredients),
    [query, ingredients]
  );

  // An exact name match means "Create" would collide with the unique index — offer the existing row.
  const hasExactMatch = ingredients.some((item) => item.name.toLowerCase() === query);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const handleSelect = (ingredient: Ingredient) => {
    onSelect({ kind: 'existing', ingredient });
    close();
  };

  const handleCreate = () => {
    onSelect({ kind: 'new', name: search.trim() });
    close();
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
      <ComboboxTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <PlusIcon />
          {label}
        </Button>
      </ComboboxTrigger>
      <ComboboxContent align="start" className="w-72" shouldFilter={false}>
        <ComboboxInput onValueChange={setSearch} placeholder="Search ingredients…" value={search} />
        <ComboboxList>
          {filtered.length > 0 ? (
            <ComboboxGroup heading="Your ingredients">
              {filtered.map((ingredient) => (
                <ComboboxItem
                  key={ingredient.id}
                  onSelect={() => handleSelect(ingredient)}
                  value={String(ingredient.id)}
                >
                  <span className="truncate">{ingredient.name}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                    {ingredientCategoryLabels[ingredient.category]}
                  </span>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ) : (
            <p className="px-3 py-4 text-center text-muted-foreground text-sm">
              {ingredients.length === 0 ? 'No ingredients yet.' : 'No matching ingredients.'}
            </p>
          )}
          {query && !hasExactMatch && (
            <>
              <ComboboxSeparator />
              <ComboboxAction onClick={handleCreate}>
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
