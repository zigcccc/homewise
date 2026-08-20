import { DragDropProvider } from '@dnd-kit/react';
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
import { useState } from 'react';
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
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { Can, ConfirmDeleteDialog, InlineTextField, RouteError, serverMessage, useCan } from '@/modules/shared';
import {
  $completeList,
  $createSection,
  $deleteList,
  $patchList,
  $reopenList,
  applyShoppingListDetail,
  CompleteListDialog,
  getShoppingListQueryOptions,
  invalidateShoppingLists,
  listTitle,
  removeShoppingListFromCache,
  useItemDrag,
} from '@/modules/shopping-lists';

import { AddItemRow } from './-components/add-item-row';
import { ListSection, UngroupedDropZone } from './-components/list-section';

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists/$listId')({
  loaderDeps: ({ search }) => ({ includeCompleted: search.includeCompleted }),
  async loader({ context, deps, params }) {
    const list = await context.queryClient.ensureQueryData(getShoppingListQueryOptions(Number(params.listId)));

    // While the filter hides completed lists, a completed list simply isn't there — including one
    // reached by direct link. Anything else makes "Show completed: off" a lie.
    if (list.completedAt && !deps.includeCompleted) {
      throw redirect({ to: '/food/shopping-lists' });
    }
  },
  component: ShoppingListDetailRoute,
  pendingComponent: () => <Spinner />,
  /**
   * A list can genuinely vanish while you're looking at it — another member deletes it, and the
   * realtime invalidation refetches its detail straight into a 404 — so this one names what
   * happened and offers somewhere to go, rather than the default reload.
   */
  errorComponent: () => (
    <RouteError description="It was deleted, or finished and filtered out." icon={ListXIcon} title="This list is gone">
      <Button asChild variant="outline">
        <Link to="/food/shopping-lists">Back to your lists</Link>
      </Button>
    </RouteError>
  ),
});

function ShoppingListDetailRoute() {
  const { listId } = Route.useParams();
  const { includeCompleted } = Route.useSearch();
  const id = Number(listId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [renaming, setRenaming] = useState(false);
  const canWrite = useCan('shoppingLists', 'write');
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

  const { grouped, onDragEnd, onDragOver, onDragStart, showDropZone } = useItemDrag(list);

  const checked = list.items.filter((item) => item.checkedAt !== null).length;
  const remaining = list.items.length - checked;

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
              className="flex cursor-pointer items-center gap-2 rounded-md text-left font-medium text-lg hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
              disabled={!canWrite}
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
          <Can access="write" area="shoppingLists">
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
          </Can>
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
        <DragDropProvider onDragEnd={onDragEnd} onDragOver={onDragOver} onDragStart={onDragStart}>
          <div className="space-y-3">
            {grouped.map(({ items, section }) => (
              <ListSection
                items={items}
                key={section?.id ?? 'ungrouped'}
                listId={id}
                readOnly={list.completedAt !== null || !canWrite}
                section={section}
                sections={list.sections}
              />
            ))}
            {showDropZone && <UngroupedDropZone />}
          </div>
        </DragDropProvider>
      )}

      {/* Sticky rather than pinned: the row keeps its place at the end of the list, and only clings to
          the bottom of the pane while that place is out of view. `sticky` alone gets that — an always-
          fixed footer would eat height on the short lists that are most of them, and a second copy
          swapped in on scroll would be a second combobox with its own half-typed state. */}
      {!list.completedAt && canWrite && (
        <div className="sticky bottom-0 bg-background pt-2">
          <AddItemRow listId={id} />
        </div>
      )}

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
