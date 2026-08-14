import { CookingPotIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Combobox, ComboboxItem, ComboboxTrigger } from '@homewise/ui/core';

import { type RecipeOption } from '@/modules/meal-plan';
import { listRecipeOptionsInfiniteQueryOptions } from '@/modules/recipes';
import { AsyncComboboxContent, useAsyncOptions } from '@/modules/shared';

/**
 * Picks a recipe, for both places that need one: adding a meal to a day, and swapping the recipe on
 * a meal that already has one. Neither is a form field — each is an action that fires a request the
 * moment you choose — so this wears `ComboboxTrigger` rather than `ComboboxFieldTrigger`.
 */
export function RecipeCombobox({
  ariaLabel,
  onPick,
  trigger,
}: {
  ariaLabel: string;
  onPick: (recipe: RecipeOption) => void;
  /** The resting-state control. Rendered inside the trigger, so it must accept a click. */
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const options = useAsyncOptions({ enabled: open, queryOptions: listRecipeOptionsInfiniteQueryOptions });

  const close = () => {
    setOpen(false);
    options.reset();
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
      <ComboboxTrigger aria-label={ariaLabel} asChild>
        {trigger}
      </ComboboxTrigger>
      <AsyncComboboxContent
        align="start"
        className="w-72"
        emptyMessage={options.search ? 'No matching recipes.' : 'No recipes yet.'}
        isEmpty={options.items.length === 0}
        options={options}
        placeholder="Search recipes…"
      >
        {options.items.map((recipe) => (
          <ComboboxItem
            key={recipe.id}
            onSelect={() => {
              onPick(recipe);
              close();
            }}
            value={String(recipe.id)}
          >
            <CookingPotIcon className="shrink-0 text-muted-foreground" />
            <span className="truncate">{recipe.title}</span>
          </ComboboxItem>
        ))}
      </AsyncComboboxContent>
    </Combobox>
  );
}
