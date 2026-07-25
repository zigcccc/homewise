import { useMutation } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

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

import { client, parseResponse } from '@/api/client';

import { ingredientCategoryLabels } from '../helpers';
import { type Ingredient } from '../ingredients.queries';

const $createIngredient = client.ingredients.$post;

/**
 * Picks an ingredient out of the household library, or mints a new one from whatever the user typed.
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
  onCreated,
  onSelect,
}: {
  ingredients: Ingredient[];
  label?: string;
  /** Fired after a new ingredient is created, so the caller can refresh its library query. */
  onCreated?: () => void;
  onSelect: (ingredient: Ingredient) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { mutateAsync: createIngredient, isPending } = useMutation({
    mutationFn: async (name: string) => parseResponse($createIngredient({ json: { name, category: 'other' } })),
  });

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
    onSelect(ingredient);
    close();
  };

  const handleCreate = async () => {
    const name = search.trim();

    try {
      const created = await createIngredient(name);
      onCreated?.();
      onSelect({ ...created, recipeCount: 0 });
      toast.success(`"${created.name}" added to your ingredients.`);
      close();
    } catch {
      toast.error(`Could not create "${name}".`);
    }
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
              <ComboboxAction disabled={isPending} onClick={() => void handleCreate()}>
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
