import { useSuspenseQuery } from '@tanstack/react-query';

import { IngredientCombobox, listIngredientsQueryOptions } from '@/modules/ingredients';
import { useListMutations } from '@/modules/shopping-lists';

/**
 * The one place items are added.
 *
 * Picking a library ingredient sends `ingredientId` and the server files it under that ingredient's
 * shop — which is what makes a list assemble its own sections. Typing a name the library doesn't
 * have sends `title` instead: a one-off like batteries goes on the list without joining the pantry
 * vocabulary, which is the distinction the combobox's action row spells out.
 */
export function AddItemRow({ listId }: { listId: number }) {
  const { data: ingredients } = useSuspenseQuery(listIngredientsQueryOptions());
  const { addItemOrToast, isAdding } = useListMutations(listId);

  return (
    <IngredientCombobox
      actionLabel="Add as a one-off"
      ingredients={ingredients}
      label={isAdding ? 'Adding…' : 'Add item'}
      onSelect={(choice) =>
        void addItemOrToast(
          choice.kind === 'existing' ? { ingredientId: choice.ingredient.id } : { title: choice.name }
        )
      }
    />
  );
}
