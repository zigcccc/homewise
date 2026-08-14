import { CollisionPriority } from '@dnd-kit/abstract';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CookingPotIcon,
  GripVerticalIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  StickyNoteIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { plannedMealTitle, putDayNoteModel } from '@homewise/server/meal-plan';
import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  $createMeal,
  $deleteMeal,
  $putDayNote,
  dayLabel,
  invalidateMealPlan,
  isToday,
  type MealPlanDay,
  type MemberOption,
  type PlannedMeal,
  stillNeedsAMeal,
  unassignedMembers,
  useInlineMealPatch,
  weekdayLabel,
} from '@/modules/meal-plan';
import { InlineTextField, serverMessage } from '@/modules/shared';

import { MealMembers } from './meal-members';
import { RecipeCombobox } from './recipe-combobox';

/** The resting and editing halves of an inline label must be the same box, or clicking in nudges it. */
const inlineLabelClassName = 'h-7 w-full rounded-md border px-1.5 text-sm';

export function MealPlanDayRow({
  day,
  members,
  onMoveMeal,
  visibleDays,
}: {
  day: MealPlanDay;
  members: MemberOption[];
  /** Hoisted so the card's menu and a drag both go through one mutation. */
  onMoveMeal: (mealId: number, toDay: string) => void;
  /** The days currently on screen — the only places the `Move to day` submenu offers. */
  visibleDays: string[];
}) {
  const queryClient = useQueryClient();
  const [editingNote, setEditingNote] = useState(false);
  const today = isToday(day.day);

  // The day itself is a drop target, which is what lets a meal land on a day that has none yet.
  // Low priority so that when the day *does* have meals, the card under the pointer wins the
  // collision and the drop lands at a position rather than at the end.
  const { isDropTarget, ref } = useDroppable({
    accept: 'meal',
    collisionPriority: CollisionPriority.Low,
    id: day.day,
    type: 'day',
  });

  const saveNote = useMutation({
    mutationFn: async (note: string) => parseResponse($putDayNote({ param: { day: day.day }, json: { note } })),
    onSuccess: () => invalidateMealPlan(queryClient),
  });

  const dayName = `${weekdayLabel(day.day)}, ${dayLabel(day.day)}`;

  // Who still has nothing to eat — the signal that a day looks planned but isn't. A day with no
  // meals at all is left alone: the empty card says it already, and naming the whole household under
  // seven of them is noise.
  const unassigned = unassignedMembers(day.meals, members);
  const fullyPlanned = day.meals.length > 0 && unassigned.length === 0;

  return (
    <Card
      className={`gap-0 py-4 ${today ? 'border-primary' : ''} ${isDropTarget ? 'ring-2 ring-primary/40' : ''}`}
      data-testid={`meal-plan-day-${day.day}`}
      ref={ref}
    >
      <CardContent className="space-y-2 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="flex items-baseline gap-2 font-medium text-sm">
            {weekdayLabel(day.day)}
            <span className="text-muted-foreground text-xs">{dayLabel(day.day)}</span>
            {today && <span className="font-normal text-primary text-xs">Today</span>}
          </h3>
          {!day.note && !editingNote && (
            <Button
              aria-label={`Add a note for ${dayName}`}
              onClick={() => setEditingNote(true)}
              size="icon-sm"
              variant="ghost"
            >
              <StickyNoteIcon />
            </Button>
          )}
        </div>

        {editingNote ? (
          <InlineTextField
            ariaLabel={`Note for ${dayName}`}
            defaultValue={day.note ?? ''}
            multiline
            onDone={() => setEditingNote(false)}
            onSave={async (note) => saveNote.mutateAsync(note)}
            placeholder="Picnic — 8 adults, 2 children"
            schema={putDayNoteModel.shape.note}
          />
        ) : (
          day.note && (
            <button
              aria-label={`Edit the note for ${dayName}`}
              className="flex w-full items-start gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-muted"
              onClick={() => setEditingNote(true)}
              type="button"
            >
              <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0" />
              {day.note}
            </button>
          )
        )}

        {day.meals.length > 0 && (
          <ol className="space-y-1.5">
            {day.meals.map((meal, index) => (
              // Keyed by the meal's own id, never the index: an open editor has to travel with its
              // meal when realtime refetches the list or another member drags something above it.
              <MealCard
                currentDay={day.day}
                index={index}
                key={meal.id}
                meal={meal}
                members={members}
                onMove={onMoveMeal}
                visibleDays={visibleDays}
              />
            ))}
          </ol>
        )}

        {day.meals.length > 0 && unassigned.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {stillNeedsAMeal(unassigned.map((member) => member.displayName))}
          </p>
        )}

        <AddMeal collapsed={fullyPlanned} day={day.day} dayName={dayName} />
      </CardContent>
    </Card>
  );
}

/**
 * The two ways to fill a day, at the bottom of it — so a second and third entry are the same gesture
 * as the first.
 *
 * Once everyone eligible has a meal they fold away behind a single `+`. That's the day's "done"
 * signal, and folding rather than hiding is deliberate: a day whose one meal is for *Everyone* is
 * fully planned the instant it's created, and a day you can't add to is a dead end.
 */
function AddMeal({ collapsed, day, dayName }: { collapsed: boolean; day: string; dayName: string }) {
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const create = useMutation({
    mutationFn: async (json: { recipeId?: number; title?: string }) =>
      parseResponse($createMeal({ json: { day, ...json } })),
    onSuccess: () => invalidateMealPlan(queryClient),
    onError: (error) => toast.error(serverMessage(error, 'Could not add that meal.')),
  });

  if (naming) {
    return (
      <InlineTextField
        ariaLabel={`What's for lunch on ${dayName}?`}
        cancellable
        className={inlineLabelClassName}
        defaultValue=""
        onDone={() => setNaming(false)}
        // Nothing is written until it has a label — the DB requires one, and an abandoned click
        // shouldn't leave an "Untitled" meal on the plan.
        onSave={async (title) => create.mutateAsync({ title })}
        placeholder="Leftovers, at work, lunch at Grandma's…"
        schema={plannedMealTitle}
      />
    );
  }

  if (collapsed && !expanded) {
    return (
      <Button
        aria-label={`Add another meal on ${dayName}`}
        className="text-muted-foreground"
        onClick={() => setExpanded(true)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-0.5">
      <RecipeCombobox
        ariaLabel={`Pick a recipe for ${dayName}`}
        onPick={(recipe) => create.mutate({ recipeId: recipe.id })}
        trigger={
          <Button size="sm" type="button" variant="outline">
            <CookingPotIcon />
            Pick a recipe
          </Button>
        }
      />
      <Button
        aria-label={`Add a custom meal on ${dayName}`}
        onClick={() => setNaming(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon />
        Add custom
      </Button>
    </div>
  );
}

function MealCard({
  currentDay,
  index,
  meal,
  members,
  onMove,
  visibleDays,
}: {
  currentDay: string;
  index: number;
  meal: PlannedMeal;
  members: MemberOption[];
  onMove: (mealId: number, toDay: string) => void;
  visibleDays: string[];
}) {
  const queryClient = useQueryClient();
  const [editingLabel, setEditingLabel] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  // Addressed by the id this card mounted with, so a save can't land on whatever later takes its slot.
  const { isPending, save, saveOrToast } = useInlineMealPatch(meal.id);

  // `group` is the ISO day, which is what makes this a cross-container sortable: dropping onto
  // another day's card moves it between groups rather than just reordering within one.
  const { handleRef, isDragging, ref } = useSortable({
    accept: 'meal',
    group: currentDay,
    id: meal.id,
    index,
    type: 'meal',
  });

  const remove = useMutation({
    mutationFn: async () => parseResponse($deleteMeal({ param: { id: String(meal.id) } })),
    onSuccess: () => {
      invalidateMealPlan(queryClient);

      // Undo rather than a confirm dialog: a planned meal holds no content of its own, and every
      // field needed to put it back is already on this card.
      toast.success(`Removed "${meal.label}"`, {
        action: {
          label: 'Undo',
          onClick: () => restore.mutate(),
        },
      });
    },
    onError: (error) => toast.error(serverMessage(error, 'Could not remove that meal.')),
  });

  const restore = useMutation({
    mutationFn: async () =>
      parseResponse(
        $createMeal({
          json: {
            day: meal.day,
            memberIds: meal.members.map((member) => member.id),
            note: meal.note ?? '',
            position: meal.position,
            recipeId: meal.recipeId,
            title: meal.title ?? '',
          },
        })
      ),
    onSuccess: () => invalidateMealPlan(queryClient),
    onError: (error) => toast.error(serverMessage(error, 'Could not restore that meal.')),
  });

  // Previous/Next stop at the edges of what's on screen: pushing a meal to a day nobody can see
  // reads as losing it. Widening the view to 2 or 4 weeks is what extends the reach.
  const dayIndex = visibleDays.indexOf(currentDay);
  const previousDay = dayIndex > 0 ? visibleDays[dayIndex - 1] : undefined;
  const nextDay = dayIndex >= 0 && dayIndex < visibleDays.length - 1 ? visibleDays[dayIndex + 1] : undefined;

  return (
    <li
      className={`rounded-md border bg-card px-2 py-1.5 ${isDragging ? 'opacity-50' : ''}`}
      data-testid={`planned-meal-${meal.id}`}
      ref={ref}
    >
      <div className="flex items-center gap-2">
        {/* A real button, so the drag handle is reachable by keyboard and touch, not pointer only. */}
        <button
          aria-label={`Move ${meal.label}`}
          className="shrink-0 cursor-grab touch-none text-muted-foreground"
          ref={handleRef}
          type="button"
        >
          <GripVerticalIcon className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          {editingLabel ? (
            <InlineTextField
              ariaLabel={`Name of ${meal.label}`}
              className={inlineLabelClassName}
              defaultValue={meal.title ?? ''}
              onDone={() => setEditingLabel(false)}
              onSave={async (title) => save({ title })}
              schema={plannedMealTitle}
            />
          ) : meal.recipe ? (
            // A recipe-backed meal reads its label off the recipe, so "editing the label" means
            // swapping the recipe rather than typing over it.
            <RecipeCombobox
              ariaLabel={`Change the recipe for ${meal.label}`}
              onPick={(recipe) => saveOrToast({ recipeId: recipe.id })}
              trigger={
                <button
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left font-medium text-sm hover:bg-accent"
                  disabled={isPending}
                  type="button"
                >
                  <CookingPotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{meal.label}</span>
                </button>
              }
            />
          ) : (
            <button
              className="w-full rounded-md px-1 py-0.5 text-left font-medium text-sm hover:bg-accent"
              disabled={isPending}
              onClick={() => setEditingLabel(true)}
              type="button"
            >
              {meal.label}
            </button>
          )}
        </div>

        <MealMembers
          disabled={isPending}
          meal={meal}
          members={members}
          onSave={(memberIds) => saveOrToast({ memberIds })}
        />

        {!meal.note && !editingNote && (
          <Button
            aria-label={`Add a note to ${meal.label}`}
            onClick={() => setEditingNote(true)}
            size="icon-sm"
            variant="ghost"
          >
            <MessageSquarePlusIcon />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Meal actions for ${meal.label}`} size="icon-sm" variant="ghost">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!previousDay} onClick={() => previousDay && onMove(meal.id, previousDay)}>
              Previous day
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!nextDay} onClick={() => nextDay && onMove(meal.id, nextDay)}>
              Next day
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to day</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {visibleDays
                    .filter((day) => day !== currentDay)
                    .map((day) => (
                      <DropdownMenuItem key={day} onClick={() => onMove(meal.id, day)}>
                        {weekdayLabel(day)}, {dayLabel(day)}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => remove.mutate()} variant="destructive">
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editingNote ? (
        <div className="mt-1 pl-6">
          <InlineTextField
            ariaLabel={`Note on ${meal.label}`}
            defaultValue={meal.note ?? ''}
            multiline
            onDone={() => setEditingNote(false)}
            onSave={async (note) => save({ note })}
            placeholder="Double batch, use up the leftovers…"
            schema={putDayNoteModel.shape.note}
          />
        </div>
      ) : (
        meal.note && (
          <button
            aria-label={`Edit the note on ${meal.label}`}
            className="mt-0.5 ml-6 rounded-md px-1 text-left text-muted-foreground text-xs hover:bg-accent"
            onClick={() => setEditingNote(true)}
            type="button"
          >
            {meal.note}
          </button>
        )
      )}
    </li>
  );
}
