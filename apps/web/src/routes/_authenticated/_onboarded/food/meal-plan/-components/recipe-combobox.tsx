import { CookingPotIcon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@homewise/ui/core';

import { type RecipeOption } from '@/modules/meal-plan';

/**
 * Picks a recipe, for both places that need one: adding a meal to a day, and swapping the recipe on
 * a meal that already has one. Neither is a form field — each is an action that fires a request the
 * moment you choose — so this wears `ComboboxTrigger` rather than `ComboboxFieldTrigger`.
 */
export function RecipeCombobox({
  ariaLabel,
  onPick,
  recipes,
  trigger,
}: {
  ariaLabel: string;
  onPick: (recipe: RecipeOption) => void;
  recipes: RecipeOption[];
  /** The resting-state control. Rendered inside the trigger, so it must accept a click. */
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(query)) : recipes),
    [query, recipes]
  );

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
      <ComboboxTrigger aria-label={ariaLabel} asChild>
        {trigger}
      </ComboboxTrigger>
      <ComboboxContent align="start" className="w-72" shouldFilter={false}>
        <ComboboxInput onValueChange={setSearch} placeholder="Search recipes…" value={search} />
        <ComboboxList>
          {filtered.length > 0 ? (
            filtered.map((recipe) => (
              <ComboboxItem
                key={recipe.id}
                onSelect={() => {
                  onPick(recipe);
                  setOpen(false);
                  setSearch('');
                }}
                value={String(recipe.id)}
              >
                <CookingPotIcon className="shrink-0 text-muted-foreground" />
                <span className="truncate">{recipe.title}</span>
              </ComboboxItem>
            ))
          ) : (
            <p className="px-3 py-4 text-center text-muted-foreground text-sm">
              {recipes.length === 0 ? 'No recipes yet.' : 'No matching recipes.'}
            </p>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
