import { CollisionPriority } from '@dnd-kit/abstract';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CornerUpRightIcon, GripVerticalIcon, MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import { patchItemModel, shoppingListSectionName } from '@homewise/server/shopping-lists';
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectTrigger,
} from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { parseResponse } from '@/api/client';
import { formatQuantity, MeasurementUnitSelectItems, measurementUnitLabels } from '@/modules/ingredients';
import { InlineTextField, SELECT_NONE, serverMessage } from '@/modules/shared';
import {
  $deleteSection,
  $patchSection,
  applyShoppingListDetail,
  ITEM_DRAG_TYPE,
  invalidateShoppingLists,
  type SectionWithItems,
  type ShoppingListDetail,
  type ShoppingListItem,
  type ShoppingListSection,
  sectionGroupId,
  UNGROUPED_GROUP,
  useListMutations,
} from '@/modules/shopping-lists';

/**
 * One heading and the items under it. `section` is `null` for the ungrouped bucket — the items that
 * came from a shop-less ingredient or were typed in as one-offs — which gets no heading of its own
 * until there's something else to distinguish it from.
 */
export function ListSection({
  items,
  listId,
  readOnly,
  section,
  sections,
}: SectionWithItems & { listId: number; readOnly: boolean; sections: ShoppingListSection[] }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);

  const groupId = sectionGroupId(section?.id ?? null);

  // The section itself is a drop target, which is what lets an item land on a shop that has none
  // yet. Low priority so that when it *does* have items, the row under the pointer wins the
  // collision and the drop lands at a position rather than at the end.
  const { isDropTarget, ref } = useDroppable({
    accept: ITEM_DRAG_TYPE,
    collisionPriority: CollisionPriority.Low,
    disabled: readOnly,
    id: groupId,
    type: 'section',
  });

  const onWritten = (detail: ShoppingListDetail) => {
    applyShoppingListDetail(queryClient, detail);
    invalidateShoppingLists(queryClient);
  };

  const param = { id: listId.toString(), sectionId: (section?.id ?? 0).toString() };

  const { mutateAsync: rename } = useMutation({
    mutationFn: async (name: string) => parseResponse($patchSection({ param, json: { name } })),
    onSuccess: onWritten,
  });

  const { mutateAsync: removeSection } = useMutation({
    mutationFn: async () => parseResponse($deleteSection({ param })),
    onSuccess: onWritten,
  });

  const handleRemoveSection = async () => {
    try {
      await removeSection();
      toast.success('Section removed — its items are still on the list.');
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <section className="space-y-1">
      {section && (
        <div className="flex items-center justify-between gap-2">
          {renaming ? (
            <InlineTextField
              ariaLabel="Section name"
              cancellable
              className="h-8"
              defaultValue={section.label}
              onDone={() => setRenaming(false)}
              onSave={async (value) => rename(value)}
              schema={shoppingListSectionName}
            />
          ) : (
            <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">{section.label}</h2>
          )}
          {!readOnly && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-7 w-7 p-0" variant="ghost">
                  <span className="sr-only">Section actions</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <PencilIcon />
                  Rename section
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRemoveSection} variant="destructive">
                  <TrashIcon />
                  Remove section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <ul className={cn('divide-y rounded-md border', isDropTarget && 'border-primary')} ref={ref}>
        {items.map((item, index) => (
          // Keyed by the record's own id, never by position: an open inline editor has to follow the
          // item it was opened on when a realtime refetch reorders the list underneath it. `index` is
          // a separate prop precisely because it isn't identity — it's where the row sits right now.
          <ListItemRow
            groupId={groupId}
            index={index}
            item={item}
            key={item.id}
            listId={listId}
            readOnly={readOnly}
            sections={sections}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Somewhere to drop an item that belongs to no shop.
 *
 * The ungrouped bucket only renders when it holds something, so a list that files everything under
 * a shop has nowhere to drag *out* to. This stands in for it — and only while a drag is in flight,
 * because a permanent empty strip on every list would be worse than the problem it solves. The
 * ⋯ → Move to → No section route is the keyboard equivalent.
 */
export function UngroupedDropZone() {
  const { isDropTarget, ref } = useDroppable({
    accept: ITEM_DRAG_TYPE,
    collisionPriority: CollisionPriority.Low,
    id: UNGROUPED_GROUP,
    type: 'section',
  });

  return (
    <div
      className={cn(
        'rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground text-sm',
        isDropTarget && 'border-primary text-foreground'
      )}
      ref={ref}
    >
      Drop here for no shop
    </div>
  );
}

function ItemLabel({
  amount,
  checked,
  editable,
  label,
  onEdit,
}: {
  amount: string | null;
  checked: boolean;
  editable: boolean;
  label: string;
  onEdit: () => void;
}) {
  const content = (
    <>
      <span className="min-w-0 truncate">{label}</span>
      {amount && <span className="shrink-0 text-muted-foreground text-xs">{amount}</span>}
    </>
  );
  const className = `flex w-full items-baseline gap-2 rounded-md text-left text-sm ${
    checked ? 'text-muted-foreground line-through' : ''
  }`;

  if (!editable) {
    return <span className={className}>{content}</span>;
  }

  return (
    <button className={`${className} cursor-pointer hover:bg-accent`} onClick={onEdit} type="button">
      {content}
    </button>
  );
}

/** The fields a row can edit, lifted from the endpoint's own model so both agree on the bounds. */
const itemEditorModel = patchItemModel.pick({ note: true, quantity: true, title: true, unit: true });
type ItemEditorValues = z.infer<typeof itemEditorModel>;

/**
 * Everything on a row that isn't its identity: how much, in what unit, and the note under it.
 *
 * A form with an explicit Save rather than an `InlineTextField` per value — three fields that only
 * make sense together ("2" is nothing without "kg"), so committing them one blur at a time would
 * send a half-changed amount to the server on the way to the next box.
 */
function ItemEditor({
  item,
  onDone,
  onSave,
}: {
  item: ShoppingListItem;
  onDone: () => void;
  onSave: (values: ItemEditorValues) => Promise<unknown>;
}) {
  // Only a free-text line has a title of its own; an ingredient's name lives on the library row, so
  // leaving it `undefined` keeps it out of the payload rather than renaming through the join.
  const renameable = item.ingredientId === null;

  const form = useForm<ItemEditorValues>({
    resolver: zodResolver(itemEditorModel),
    defaultValues: {
      note: item.note ?? '',
      quantity: item.quantity,
      title: renameable ? item.label : undefined,
      unit: item.unit,
    },
  });

  const submit = async (values: ItemEditorValues) => {
    try {
      await onSave(values);
      onDone();
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <Form {...form}>
      <form
        className="space-y-2"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onDone();
          }
        }}
        onSubmit={form.handleSubmit(submit)}
      >
        {/* The row's identity, always on screen: editable for a free-text line, plain text for an
            ingredient. Without it an open editor is three anonymous boxes and you've lost track of
            which item you're in. */}
        {renameable ? (
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input {...field} aria-label="Item name" autoFocus className="h-8" value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <p className="truncate font-medium text-sm">{item.label}</p>
        )}

        <div className="flex flex-wrap items-start gap-2">
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem className="w-20">
                <FormControl>
                  <Input
                    aria-label="Quantity"
                    autoFocus={!renameable}
                    className="h-8"
                    min="0"
                    name={field.name}
                    onBlur={field.onBlur}
                    // A number input hands back a string, and an unparseable one is "no amount"
                    // rather than `NaN` — which the schema would reject with nothing useful to say.
                    onChange={(event) => {
                      const next = Number(event.target.value);

                      field.onChange(event.target.value === '' || Number.isNaN(next) ? null : next);
                    }}
                    placeholder="Any"
                    ref={field.ref}
                    step="any"
                    type="number"
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem className="w-24">
                <Select
                  onValueChange={(value) => field.onChange(value === SELECT_NONE ? null : value)}
                  value={field.value ?? SELECT_NONE}
                >
                  <FormControl>
                    <SelectTrigger aria-label="Unit" className="w-full" size="sm">
                      <span>{field.value ? measurementUnitLabels[field.value] : '—'}</span>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <MeasurementUnitSelectItems noneLabel="—" />
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem className="min-w-32 flex-1">
                <FormControl>
                  <Input
                    {...field}
                    aria-label="Note"
                    className="h-8"
                    placeholder="the big pack"
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button className="h-8" loading={form.formState.isSubmitting} size="sm" type="submit">
            Save
          </Button>
          <Button className="h-8" onClick={onDone} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ListItemRow({
  groupId,
  index,
  item,
  listId,
  readOnly,
  sections,
}: {
  groupId: string;
  index: number;
  item: ShoppingListItem;
  listId: number;
  readOnly: boolean;
  sections: ShoppingListSection[];
}) {
  const [editing, setEditing] = useState(false);
  const { removeItemWithUndo, saveItem, saveItemOrToast } = useListMutations(listId);

  // `group` is the section, which is what makes this a cross-container sortable: dropping onto
  // another shop's row moves it between groups rather than just reordering within one.
  const { handleRef, isDragging, ref } = useSortable({
    accept: ITEM_DRAG_TYPE,
    // Editing a row means dragging on top of live inputs, and a finished list isn't rearranged.
    disabled: readOnly || editing,
    group: groupId,
    id: item.id,
    index,
    type: ITEM_DRAG_TYPE,
  });

  const checked = item.checkedAt !== null;
  // Only when there's a number to show. `formatQuantity` renders a quantity-less line as "to taste",
  // which is right for a recipe and wrong here — "bread" just has no amount.
  const amount = item.quantity === null ? null : formatQuantity(item.quantity, item.unit);

  // Where this row could go instead. Its own section isn't a destination, and neither is "no
  // section" when it's already there — offering a move that does nothing is just a dead menu entry.
  const destinations = sections.filter((section) => section.id !== item.sectionId);
  const movable = destinations.length > 0 || item.sectionId !== null;

  return (
    <li className={cn('flex items-center gap-2 px-3 py-2', isDragging && 'opacity-50')} ref={ref}>
      {!readOnly && (
        // A real button, so the handle is reachable by keyboard and touch, not pointer only.
        <button
          aria-label={`Move ${item.label}`}
          className="shrink-0 cursor-grab touch-none text-muted-foreground"
          ref={handleRef}
          type="button"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}

      <Checkbox
        aria-label={`Tick ${item.label}`}
        checked={checked}
        disabled={readOnly}
        onCheckedChange={(next) => void saveItemOrToast(item.id, { checked: next === true })}
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          // Mounted only while editing, so `defaultValues` reseed on every open with no reset effect.
          <ItemEditor
            item={item}
            onDone={() => setEditing(false)}
            onSave={async (values) => saveItem({ itemId: item.id, json: values })}
          />
        ) : (
          <>
            {/* Clicking the name opens the editor whatever kind of row this is — a one-off and an
                ingredient differ only in whether the name itself is editable, and needing the ⋯ menu
                for one but not the other is a distinction the reader can't see. */}
            <ItemLabel
              amount={amount}
              checked={checked}
              editable={!readOnly}
              label={item.label}
              onEdit={() => setEditing(true)}
            />
            {item.note && <p className="text-muted-foreground text-xs">{item.note}</p>}
            {checked && item.checkedBy && <p className="text-muted-foreground text-xs">Got by {item.checkedBy}</p>}
          </>
        )}
      </div>

      {!readOnly && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-7 w-7 shrink-0 p-0" variant="ghost">
              <span className="sr-only">Actions for {item.label}</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit amount
            </DropdownMenuItem>
            {movable && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CornerUpRightIcon />
                  Move to
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {destinations.map((section) => (
                    <DropdownMenuItem
                      key={section.id}
                      onClick={() => void saveItemOrToast(item.id, { sectionId: section.id })}
                    >
                      {section.label}
                    </DropdownMenuItem>
                  ))}
                  {item.sectionId !== null && (
                    <DropdownMenuItem onClick={() => void saveItemOrToast(item.id, { sectionId: null })}>
                      No section
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void removeItemWithUndo(item)} variant="destructive">
              <TrashIcon />
              Remove item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
