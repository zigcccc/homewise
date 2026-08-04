import { move } from '@dnd-kit/helpers';
import { type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { groupIdToSectionId, sectionGroupId, UNGROUPED_GROUP } from '../helpers/drag';
import {
  applyItemArrangement,
  arrangeItems,
  type ItemArrangement,
  itemArrangement,
  type SectionWithItems,
  type ShoppingListDetail,
  toSectionsWithItems,
} from '../shopping-lists.queries';
import { useListMutations } from './use-list-mutations';

/**
 * Dragging an item between shops, and the order the pane renders while a drag is in flight.
 *
 * Owns the whole concern — the proposed arrangement, where the row started, and the three dnd-kit
 * handlers — so the route renders `grouped` and hands the handlers to `DragDropProvider` without
 * carrying any of the bookkeeping itself.
 */
export function useItemDrag(list: ShoppingListDetail): {
  grouped: SectionWithItems[];
  onDragEnd: (event: DragEndEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  showDropZone: boolean;
} {
  const queryClient = useQueryClient();
  const { moveItemOrToast } = useListMutations(list.id);
  const origin = useRef<{ groupId: string; index: number } | null>(null);

  /**
   * The order the drag currently proposes, and `null` when no drag is in flight.
   *
   * While it's set, the pane renders from it rather than from the query. That's what keeps React's
   * order in step with the node dnd-kit has already moved in the DOM, and what stops a refetch
   * landing mid-drag — another member ticking something off — from reshuffling rows under the
   * pointer. See `arrangeItems`.
   */
  const [arrangement, setArrangement] = useState<ItemArrangement | null>(null);

  const grouped = toSectionsWithItems(arrangement ? { ...list, items: arrangeItems(list.items, arrangement) } : list);

  const onDragStart = (event: DragStartEvent) => {
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
    setArrangement(initial);
  };

  const onDragOver = (event: DragOverEvent) => {
    setArrangement((current) => (current ? move(current, event) : current));
  };

  /**
   * A drop landed. The arrangement names its section by which key now holds it, and its position by
   * its index there.
   */
  const onDragEnd = (event: DragEndEvent) => {
    const draggedId = event.operation.source?.id;
    const before = arrangement;
    setArrangement(null);

    // Cancelled, or nothing to compare against — either way the query's own order stands.
    if (event.canceled || draggedId === undefined || !before || !origin.current) {
      return;
    }

    const movedId = Number(draggedId);
    const after = move(before, event);
    applyItemArrangement(queryClient, list.id, after);

    const from = origin.current;

    for (const [groupId, ids] of Object.entries(after)) {
      const position = ids.indexOf(movedId);

      if (position === -1) {
        continue;
      }

      const changedSection = from.groupId !== groupId;

      // A drag that ended where it started is not a move.
      if (changedSection || from.index !== position) {
        void moveItemOrToast({
          itemId: movedId,
          position,
          sectionId: changedSection ? groupIdToSectionId(groupId) : undefined,
        });
      }

      return;
    }
  };

  return {
    grouped,
    onDragEnd,
    onDragOver,
    onDragStart,
    // Only worth offering when there's a shop to drag out of and no ungrouped bucket already shown.
    showDropZone: arrangement !== null && grouped.length > 0 && grouped.every(({ section }) => section !== null),
  };
}
