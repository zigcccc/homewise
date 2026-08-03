import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
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
import { ConfirmDeleteDialog, InlineTextField, SELECT_NONE, serverMessage } from '@/modules/shared';
import { StoreCombobox } from '@/modules/stores';

const $deleteIngredient = client.ingredients[':id'].$delete;

const columnHelper = createColumnHelper<Ingredient>();

/**
 * Name, category and default unit are edited straight in the table: a recipe mints ingredients with
 * no unit and no category, and fixing fifteen of them through a dialog is fifteen round-trips. Each
 * cell takes only the id it patches and the value it shows, so nothing here depends on the rest of
 * the row.
 */
export const ingredientsTableColumns = [
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
];

/**
 * An editable cell should read as table text until you reach for it, or a library of staples turns
 * into a wall of form controls. The border and chevron arrive on hover, focus and while open — the
 * descendant `[&_svg]` selectors outrank the chevron's own `opacity-50`.
 *
 * Every inline control stays inside the cell's own `p-2`: column widths come from the content in an
 * auto-layout table, so a control that overflows its cell widens the column and shoves the rest of
 * the table sideways the moment you touch it. Staying inside also leaves room for the focus ring,
 * which would otherwise be drawn over the table border in the first column.
 */
const inlineSelectTriggerClassName =
  'w-full justify-between border-transparent px-2 shadow-none not-disabled:cursor-pointer hover:bg-accent focus-visible:border-ring data-[state=open]:border-input data-[state=open]:bg-accent [&_svg]:opacity-0 hover:[&_svg]:opacity-60 focus-visible:[&_svg]:opacity-60 data-[state=open]:[&_svg]:opacity-60';

function IngredientCategoryCell({ category, id }: { category: IngredientCategory; id: number }) {
  const { isPending, saveOrToast } = useInlineIngredientPatch(id);

  return (
    <Select
      disabled={isPending}
      onValueChange={(value) => saveOrToast({ category: ingredientCategory.parse(value) })}
      value={category}
    >
      <SelectTrigger aria-label="Category" className={inlineSelectTriggerClassName}>
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
  const { isPending, saveOrToast } = useInlineIngredientPatch(id);

  return (
    <StoreCombobox
      className={inlineSelectTriggerClassName}
      disabled={isPending}
      noneLabel="—"
      onChange={(choice) =>
        saveOrToast(
          choice.kind === 'new'
            ? { storeName: choice.name }
            : { storeId: choice.kind === 'existing' ? choice.id : null }
        )
      }
      value={store ? { kind: 'existing', id: store.id } : { kind: 'none' }}
    />
  );
}

function IngredientDefaultUnitCell({ defaultUnit, id }: { defaultUnit: MeasurementUnit | null; id: number }) {
  const { isPending, saveOrToast } = useInlineIngredientPatch(id);

  return (
    <Select
      disabled={isPending}
      onValueChange={(value) =>
        saveOrToast({ defaultUnit: value === SELECT_NONE ? null : measurementUnit.parse(value) })
      }
      value={defaultUnit ?? SELECT_NONE}
    >
      <SelectTrigger aria-label="Default unit" className={inlineSelectTriggerClassName}>
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

/**
 * The resting and editing halves of the name cell have to be the same box down to the border, or
 * clicking in nudges the text and resizes the column. `Input` supplies `h-9`, `w-full` and a 1px
 * border; the button matches with a transparent one.
 */
const inlineNameClassName = 'h-9 w-full rounded-md border px-2 text-sm';

/**
 * A hidden copy of the name, sharing the controls' horizontal box, that holds the column open. An
 * `<input>` reports its default 20-character width as its max-content contribution to an auto-layout
 * table no matter what `width` says — `size={1}` drops that to nothing, and this puts the name's own
 * width back, so the column measures the same whichever state the cell is in.
 */
const inlineNameSizerClassName = 'invisible col-start-1 row-start-1 border px-2 text-sm';

/** Click to rename in place. The dialog stays the way to reach the fields the table doesn't show. */
function IngredientNameCell({ id, name }: { id: number; name: string }) {
  const [editing, setEditing] = useState(false);
  const { save } = useInlineIngredientPatch(id);

  return (
    // Both states stack into the one grid cell, over the sizer that fixes the column's width. The
    // single `1fr` track means they fill the column when it's wider than the name.
    <div className="grid grid-cols-1">
      <span className={inlineNameSizerClassName}>{name}</span>
      {editing ? (
        // Mounted only while editing, so `defaultValues` reseed on every open with no reset effect.
        <InlineTextField
          ariaLabel="Name"
          className={`${inlineNameClassName} col-start-1 row-start-1`}
          defaultValue={name}
          onDone={() => setEditing(false)}
          onSave={async (value) => save({ name: value })}
          schema={createIngredientModel.shape.name}
        />
      ) : (
        <button
          className={`${inlineNameClassName} col-start-1 row-start-1 flex cursor-pointer items-center border-transparent text-left hover:bg-accent`}
          onClick={() => setEditing(true)}
          type="button"
        >
          {name}
        </button>
      )}
    </div>
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
