import { useSuspenseQuery } from '@tanstack/react-query';

import { IngredientCombobox } from '@/modules/ingredients';
import { getShoppingListQueryOptions, useListMutations } from '@/modules/shopping-lists';

/**
 * The one place items are added.
 *
 * Picking a library ingredient sends `ingredientId` and the server files it under that ingredient's
 * shop — which is what makes a list assemble its own sections. Typing a name the library doesn't
 * have sends `title` instead: a one-off like batteries goes on the list without joining the pantry
 * vocabulary, which is the distinction the combobox's action row spells out.
 */
export function AddItemRow({ listId }: { listId: number }) {
  const { data: list } = useSuspenseQuery(getShoppingListQueryOptions(listId));
  const { addItemOrToast, isAdding } = useListMutations(listId);

  // One line per ingredient: the ones already here are shown but not selectable, so the rule shows
  // up as a greyed-out row rather than a 409 after the click.
  const usedIds = list.items.map((item) => item.ingredientId).filter((id) => id !== null);

  return (
    <IngredientCombobox
      actionLabel="Add as a one-off"
      label={isAdding ? 'Adding…' : 'Add item'}
      // The shop, not the aisle: it's what decides which section the item lands in.
      meta="store"
      onSelect={(choice) =>
        void addItemOrToast(
          choice.kind === 'existing' ? { ingredientId: choice.ingredient.id } : { title: choice.name }
        )
      }
      usedIds={usedIds}
    />
  );
}
