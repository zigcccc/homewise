import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import {
  CheckIcon,
  ChevronLeftIcon,
  CookingPotIcon,
  ListXIcon,
  MoreHorizontal,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { shoppingListName, shoppingListSectionName } from '@homewise/server/shopping-lists';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { listIngredientsQueryOptions } from '@/modules/ingredients';
import { ConfirmDeleteDialog, InlineTextField, serverMessage } from '@/modules/shared';
import {
  $completeList,
  $createSection,
  $deleteList,
  $patchList,
  $reopenList,
  applyItemArrangement,
  applyShoppingListDetail,
  arrangeItems,
  CompleteListDialog,
  getShoppingListQueryOptions,
  groupIdToSectionId,
  type ItemArrangement,
  invalidateShoppingLists,
  itemArrangement,
  listTitle,
  removeShoppingListFromCache,
  sectionGroupId,
  toSectionsWithItems,
  UNGROUPED_GROUP,
  useListMutations,
} from '@/modules/shopping-lists';

import { AddItemRow } from './-components/add-item-row';
import { ListSection, UngroupedDropZone } from './-components/list-section';

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists/$listId')({
  loaderDeps: ({ search }) => ({ includeCompleted: search.includeCompleted }),
  async loader({ context, deps, params }) {
    const [list] = await Promise.all([
      context.queryClient.ensureQueryData(getShoppingListQueryOptions(Number(params.listId))),
      // The add-item picker opens without a spinner, and the library is small.
      context.queryClient.ensureQueryData(listIngredientsQueryOptions()),
    ]);

    // While the filter hides completed lists, a completed list simply isn't there — including one
    // reached by direct link. Anything else makes "Show completed: off" a lie.
    if (list.completedAt && !deps.includeCompleted) {
      throw redirect({ to: '/food/shopping-lists' });
    }
  },
  component: ShoppingListDetailRoute,
  pendingComponent: () => <Spinner />,
  /**
   * A list can vanish while you're looking at it — another member deletes it, and the realtime
   * invalidation refetches its detail straight into a 404. Without a boundary here that rejection
   * reaches the root one and replaces the entire app with "Something went wrong!", taking the
   * sidebar and the list of lists with it.
   *
   * Scoped to this route, so only the pane that lost its subject says so.
   */
  errorComponent: () => (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListXIcon />
        </EmptyMedia>
        <EmptyTitle>This list is gone</EmptyTitle>
        <EmptyDescription>It was deleted, or finished and filtered out.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link to="/food/shopping-lists">Back to your lists</Link>
        </Button>
      </EmptyContent>
    </Empty>
  ),
});

function ShoppingListDetailRoute() {
  const { listId } = Route.useParams();
  const { includeCompleted } = Route.useSearch();
  const id = Number(listId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [renaming, setRenaming] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);

  const { data: list } = useSuspenseQuery(getShoppingListQueryOptions(id));

  const param = { id: listId };
  const onWritten = (detail: typeof list) => {
    applyShoppingListDetail(queryClient, detail);
    invalidateShoppingLists(queryClient);
  };

  const { mutateAsync: rename } = useMutation({
    mutationFn: async (name: string | null) => parseResponse($patchList({ param, json: { name } })),
    onSuccess: onWritten,
  });

  const { mutateAsync: addSection } = useMutation({
    mutationFn: async (name: string) => parseResponse($createSection({ param, json: { name } })),
    onSuccess: onWritten,
  });

  const { mutateAsync: complete } = useMutation({
    mutationFn: async (unchecked: 'carry-over' | 'discard') =>
      parseResponse($completeList({ param, json: { unchecked } })),
    onSuccess: (result) => {
      applyShoppingListDetail(queryClient, result.list);
      invalidateShoppingLists(queryClient);
    },
  });

  const { mutateAsync: reopen } = useMutation({
    mutationFn: async () => parseResponse($reopenList({ param })),
    onSuccess: onWritten,
  });

  const { mutateAsync: removeList } = useMutation({
    mutationFn: async () => parseResponse($deleteList({ param })),
  });

  const { moveItem } = useListMutations(id);
  const origin = useRef<{ groupId: string; index: number } | null>(null);

  /**
   * The order the drag currently proposes, and `null` when no drag is in flight.
   *
   * While it's set, the pane renders from it rather than from the query. That's what keeps React's
   * order in step with the node dnd-kit has already moved in the DOM, and what stops a refetch
   * landing mid-drag — another member ticking something off — from reshuffling rows under the
   * pointer. See `arrangeItems`.
   */
  const [dragArrangement, setDragArrangement] = useState<ItemArrangement | null>(null);

  const grouped = toSectionsWithItems(
    dragArrangement ? { ...list, items: arrangeItems(list.items, dragArrangement) } : list
  );
  const checked = list.items.filter((item) => item.checkedAt !== null).length;
  const remaining = list.items.length - checked;

  // Only worth offering when there's a shop to drag out of and no ungrouped bucket already on screen.
  const showDropZone =
    dragArrangement !== null && grouped.length > 0 && grouped.every(({ section }) => section !== null);

  const handleDragStart = (event: DragStartEvent) => {
    const movedId = Number(event.operation.source?.id);
    const from = grouped.find(({ items }) => items.some((item) => item.id === movedId));

    // Where the row started. Kept aside because the arrangement moves under every hover — by drop
    // time it already reports the row at its proposed place, so it can't answer "did this move?".
    origin.current = from
      ? {
          groupId: sectionGroupId(from.section?.id ?? null),
          index: from.items.findIndex((item) => item.id === movedId),
        }
      : null;

    const initial = itemArrangement(grouped);
    // The mid-drag drop zone holds nothing, so `grouped` doesn't know about it — `move()` needs the
    // key to exist before it can put anything in it. `??=`, or a list that already has ungrouped
    // items would have them emptied out from under it.
    initial[UNGROUPED_GROUP] ??= [];
    setDragArrangement(initial);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setDragArrangement((current) => (current ? move(current, event) : current));
  };

  /**
   * A drop landed. The arrangement names its section by which key now holds it, and its position by
   * its index there.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const draggedId = event.operation.source?.id;
    const before = dragArrangement;
    setDragArrangement(null);

    // Cancelled, or nothing to compare against — either way the query's own order stands.
    if (event.canceled || draggedId === undefined || !before || !origin.current) {
      return;
    }

    const movedId = Number(draggedId);
    const after = move(before, event);
    applyItemArrangement(queryClient, id, after);

    const from = origin.current;

    for (const [groupId, ids] of Object.entries(after)) {
      const position = ids.indexOf(movedId);

      if (position === -1) {
        continue;
      }

      const changedSection = from.groupId !== groupId;

      // A drag that ended where it started is not a move.
      if (changedSection || from.index !== position) {
        void moveItem({
          itemId: movedId,
          position,
          sectionId: changedSection ? groupIdToSectionId(groupId) : undefined,
        });
      }

      return;
    }
  };

  const handleComplete = async (unchecked: 'carry-over' | 'discard') => {
    try {
      const result = await complete(unchecked);
      if (result.carriedListId !== null) {
        toast.success('Unticked items moved to a new list.');
        await navigate({
          params: { listId: result.carriedListId.toString() },
          to: '/food/shopping-lists/$listId',
        });

        return;
      }
      toast.success('List marked as done.');

      // It's completed now, so the filter no longer admits it — leave rather than sit on a list the
      // master column has stopped listing.
      if (!includeCompleted) {
        await navigate({ replace: true, to: '/food/shopping-lists' });
      }
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  const handleMarkDone = () => {
    // Nothing left to decide when everything is ticked — no dialog, just finish it.
    if (remaining === 0) {
      void handleComplete('discard');

      return;
    }
    setCompleteOpen(true);
  };

  const handleDelete = async () => {
    try {
      await removeList();
      toast.success('List deleted.');
      // Before navigating, not after: the index route auto-selects the first list it can see, and a
      // stale cache would hand it the one just deleted — leaving the page showing it.
      removeShoppingListFromCache(queryClient, id);
      await navigate({ replace: true, to: '/food/shopping-lists' });
      invalidateShoppingLists(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      {/* The master column is off-screen under `md`, so this is the only way back to it. */}
      <Link className="flex items-center gap-1 text-muted-foreground text-sm md:hidden" to="/food/shopping-lists">
        <ChevronLeftIcon className="size-4" />
        All lists
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            // Mounted only while editing, so `defaultValues` reseed on every open with no reset effect.
            <InlineTextField
              ariaLabel="List name"
              cancellable
              className="h-9 text-lg"
              defaultValue={list.name ?? ''}
              onDone={() => setRenaming(false)}
              onSave={async (value) => rename(value.trim() === '' ? null : value)}
              placeholder={list.label}
              schema={shoppingListName}
            />
          ) : (
            <button
              className="flex cursor-pointer items-center gap-2 rounded-md text-left font-medium text-lg hover:bg-accent"
              onClick={() => setRenaming(true)}
              type="button"
            >
              {listTitle(list)}
              {list.completedAt && (
                <Badge variant="secondary">
                  <CheckIcon />
                  Done
                </Badge>
              )}
            </button>
          )}
          {/* Test id because the master column shows the same "N of M ticked" for every list, so
              there is no accessible name that distinguishes this one. */}
          <p className="text-muted-foreground text-sm" data-testid="list-progress">
            {list.items.length === 0 ? 'Nothing on this list yet.' : `${checked} of ${list.items.length} ticked`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!list.completedAt && (
            <Button onClick={handleMarkDone} size="sm" variant="outline">
              <CheckIcon />
              Mark done
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 p-0" variant="ghost">
                <span className="sr-only">List actions</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link search={{ target: id }} to="/food/shopping-lists/import">
                  <CookingPotIcon />
                  Add from meal plan
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddingSection(true)}>
                <PlusIcon />
                Add section
              </DropdownMenuItem>
              {list.completedAt && (
                <DropdownMenuItem onClick={() => void reopen()}>
                  <RotateCcwIcon />
                  Reopen list
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                <TrashIcon />
                Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {addingSection && (
        <InlineTextField
          ariaLabel="Section name"
          cancellable
          className="h-9"
          defaultValue=""
          onDone={() => setAddingSection(false)}
          onSave={async (value) => addSection(value)}
          placeholder="Section name"
          schema={shoppingListSectionName}
        />
      )}

      {grouped.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add an ingredient and it files itself under the shop you buy it at.
        </p>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd} onDragOver={handleDragOver} onDragStart={handleDragStart}>
          <div className="space-y-3">
            {grouped.map(({ items, section }) => (
              <ListSection
                items={items}
                key={section?.id ?? 'ungrouped'}
                listId={id}
                readOnly={list.completedAt !== null}
                section={section}
                sections={list.sections}
              />
            ))}
            {showDropZone && <UngroupedDropZone />}
          </div>
        </DragDropProvider>
      )}

      {!list.completedAt && <AddItemRow listId={id} />}

      <CompleteListDialog
        onConfirm={handleComplete}
        onOpenChange={setCompleteOpen}
        open={completeOpen}
        remaining={remaining}
      />

      <ConfirmDeleteDialog
        confirmLabel="Delete list"
        description={<>"{list.label}" and everything on it will be permanently removed.</>}
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${list.label}"?`}
      />
    </div>
  );
}
