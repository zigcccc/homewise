import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  createIngredientModel,
  type IngredientCategory,
  ingredientCategory,
  type MeasurementUnit,
  measurementUnit,
} from '@homewise/server/ingredients';
import {
  Button,
  createDataTableColumnHelper,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectTrigger,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import {
  type Ingredient,
  IngredientCategorySelectItems,
  IngredientFormDialog,
  ingredientCategoryLabels,
  invalidateIngredients,
  MeasurementUnitSelectItems,
  measurementUnitLabels,
  useInlineIngredientPatch,
} from '@/modules/ingredients';
import {
  Can,
  ConfirmDeleteDialog,
  InlineCell,
  inlineTriggerClassName,
  SELECT_NONE,
  serverMessage,
} from '@/modules/shared';
import { StoreCombobox } from '@/modules/stores';

const $deleteIngredient = client.ingredients[':id'].$delete;

const columnHelper = createDataTableColumnHelper<Ingredient>();

/**
 * Name, category and default unit are edited straight in the table: a recipe mints ingredients with
 * no unit and no category, and fixing fifteen of them through a dialog is fifteen round-trips. Each
 * cell takes only the id it patches and the value it shows, so nothing here depends on the rest of
 * the row.
 */
export const ingredientsTableColumns = columnHelper.columns([
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => <IngredientNameCell id={info.row.original.id} name={info.getValue()} />,
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => <IngredientCategoryCell category={info.getValue()} id={info.row.original.id} />,
  }),
  columnHelper.accessor('store', {
    header: 'Shop',
    cell: (info) => <IngredientStoreCell id={info.row.original.id} store={info.getValue()} />,
  }),
  columnHelper.accessor('defaultUnit', {
    header: 'Default unit',
    cell: (info) => <IngredientDefaultUnitCell defaultUnit={info.getValue()} id={info.row.original.id} />,
  }),
  columnHelper.accessor('recipeCount', {
    header: 'Used in',
    cell: (info) => `${info.getValue()} ${info.getValue() === 1 ? 'recipe' : 'recipes'}`,
  }),
  columnHelper.display({
    id: 'actions',
    // The dialog behind "Edit ingredient" covers every field, including the ones no column shows, so
    // this is the one cell that genuinely needs the whole row.
    cell: (info) => <IngredientRowActions ingredient={info.row.original} />,
    header: '',
  }),
]);

function IngredientCategoryCell({ category, id }: { category: IngredientCategory; id: number }) {
  const { isPending, saveOrToast, readOnly } = useInlineIngredientPatch(id);

  return (
    <Select
      disabled={isPending || readOnly}
      onValueChange={(value) => saveOrToast({ category: ingredientCategory.parse(value) })}
      value={category}
    >
      <SelectTrigger aria-label="Category" className={inlineTriggerClassName}>
        <span>{ingredientCategoryLabels[category]}</span>
      </SelectTrigger>
      <SelectContent>
        <IngredientCategorySelectItems />
      </SelectContent>
    </Select>
  );
}

/**
 * Which shop this is bought at — and so which section of a shopping list it files itself under.
 *
 * A combobox rather than a select, because a shop the household hasn't recorded yet is the common
 * case while triaging recipe-born ingredients, and making the user leave for the Shops tab to add
 * one is the friction this avoids. Naming a new shop patches `storeName`, and the server
 * finds-or-creates it as part of the same write — the dialog's field does exactly the same thing.
 */
function IngredientStoreCell({ id, store }: { id: number; store: Ingredient['store'] }) {
  const { isPending, saveOrToast, readOnly } = useInlineIngredientPatch(id);

  return (
    <StoreCombobox
      className={inlineTriggerClassName}
      disabled={isPending || readOnly}
      noneLabel="—"
      onChange={(choice) =>
        saveOrToast(
          choice.kind === 'new'
            ? { storeName: choice.name }
            : { storeId: choice.kind === 'existing' ? choice.store.id : null }
        )
      }
      value={store ? { kind: 'existing', store } : { kind: 'none' }}
    />
  );
}

function IngredientDefaultUnitCell({ defaultUnit, id }: { defaultUnit: MeasurementUnit | null; id: number }) {
  const { isPending, saveOrToast, readOnly } = useInlineIngredientPatch(id);

  return (
    <Select
      disabled={isPending || readOnly}
      onValueChange={(value) =>
        saveOrToast({ defaultUnit: value === SELECT_NONE ? null : measurementUnit.parse(value) })
      }
      value={defaultUnit ?? SELECT_NONE}
    >
      <SelectTrigger aria-label="Default unit" className={inlineTriggerClassName}>
        <span className={defaultUnit ? undefined : 'text-muted-foreground'}>
          {defaultUnit ? measurementUnitLabels[defaultUnit] : '—'}
        </span>
      </SelectTrigger>
      <SelectContent>
        <MeasurementUnitSelectItems noneLabel="—" />
      </SelectContent>
    </Select>
  );
}

/** Click to rename in place. The dialog stays the way to reach the fields the table doesn't show. */
function IngredientNameCell({ id, name }: { id: number; name: string }) {
  const { save, readOnly } = useInlineIngredientPatch(id);

  return (
    <InlineCell
      ariaLabel="Name"
      display={name}
      fill
      onSave={async (value) => save({ name: value })}
      readOnly={readOnly}
      schema={createIngredientModel.shape.name}
      value={name}
    />
  );
}

/** Row menu: edit opens the same dialog in edit mode, delete confirms and surfaces the in-use 409. */
function IngredientRowActions({ ingredient }: { ingredient: Ingredient }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteIngredient } = useMutation({
    mutationFn: async () => parseResponse($deleteIngredient({ param: { id: ingredient.id.toString() } })),
  });

  const handleDelete = async () => {
    try {
      await deleteIngredient();
      toast.success(`"${ingredient.name}" deleted.`);
      invalidateIngredients(queryClient);
    } catch (error) {
      // The server refuses while any recipe still uses it — show that reason, not a generic failure.
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  return (
    <div className="flex justify-end">
      <Can access="write" area="ingredients">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 w-8 p-0" variant="ghost">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Edit ingredient
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
              <TrashIcon />
              Delete ingredient
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Can>

      <IngredientFormDialog ingredient={ingredient} onOpenChange={setEditOpen} open={editOpen} />

      <ConfirmDeleteDialog
        // The server refuses while any recipe still uses it, so confirming could only ever produce a
        // 409 — block it here and let the description say why.
        confirmDisabled={ingredient.recipeCount > 0}
        confirmLabel="Delete ingredient"
        description={
          ingredient.recipeCount > 0 ? (
            <>
              "{ingredient.name}" is used in {ingredient.recipeCount}{' '}
              {ingredient.recipeCount === 1 ? 'recipe' : 'recipes'}. Remove it from them before deleting it.
            </>
          ) : (
            <>"{ingredient.name}" will be permanently removed from your ingredient library.</>
          )
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${ingredient.name}"?`}
      />
    </div>
  );
}
