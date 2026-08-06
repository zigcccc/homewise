import { type Mutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { type MealPlanRange, mealPlanRangeQueryOptions, toDaysWithMeals } from '../meal-plan.queries';
import { useMealMove } from './use-meal-move';

/**
 * The optimistic write a move makes before its request goes out, and what it decides to send. E2E
 * only ever sees the plan once the refetch has landed, so the frame in between is this layer's.
 *
 * The request itself is left to fail against no server: faking the response would mean standing in
 * for our own API. `onDragEnd` isn't driven from here either — resolving a drop needs a live dnd-kit
 * drag operation; `resolveMealMove` covers what it decides, and `meal-plan.spec.ts` covers the drag.
 */

const RANGE = { from: '2026-08-03', to: '2026-08-04' };

const meal = (id: number, day: string, position: number) =>
  ({
    day,
    id,
    label: `Meal ${id}`,
    members: [],
    note: null,
    position,
    recipe: null,
    recipeId: null,
    title: `Meal ${id}`,
  }) satisfies MealPlanRange['meals'][number];

const plan = () =>
  ({
    days: [
      { day: '2026-08-03', note: null },
      { day: '2026-08-04', note: null },
    ],
    from: RANGE.from,
    meals: [meal(1, '2026-08-03', 0), meal(2, '2026-08-03', 1), meal(3, '2026-08-03', 2), meal(4, '2026-08-04', 0)],
    to: RANGE.to,
  }) satisfies MealPlanRange;

function setup() {
  const queryClient = new QueryClient({
    // The request has no server to reach, and this is about what happens before it.
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const key = mealPlanRangeQueryOptions(RANGE).queryKey;
  queryClient.setQueryData(key, plan());

  // Read off the mutation cache rather than the network, so the assertion doesn't depend on the
  // request going anywhere. The mutation is kept rather than its variables — `added` fires before
  // `execute` sets them.
  const enqueued: Mutation[] = [];
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'added') {
      enqueued.push(event.mutation);
    }
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMealMove(RANGE, toDaysWithMeals(plan())), { wrapper });

  /** Which day holds which cards right now, as the plan would render them. */
  const layout = () => {
    const range = queryClient.getQueryData(key);

    if (!range) {
      throw new Error('The plan is no longer in the cache.');
    }

    return Object.fromEntries(toDaysWithMeals(range).map((day) => [day.day, day.meals.map(({ id }) => id)]));
  };

  return { layout, result, sent: () => enqueued.map((mutation) => mutation.state.variables) };
}

describe('moveMeal', () => {
  it('sends the day and index it was asked for', async () => {
    const { result, sent } = setup();

    await act(async () => {
      result.current.moveMeal({ id: 2, position: 0, toDay: '2026-08-04' });
    });

    expect(sent()).toEqual([{ id: 2, position: 0, toDay: '2026-08-04' }]);
  });

  it('leaves the index out when the menu named only a day', async () => {
    const { result, sent } = setup();

    await act(async () => {
      result.current.moveMeal({ id: 1, toDay: '2026-08-04' });
    });

    expect(sent()).toEqual([{ id: 1, toDay: '2026-08-04' }]);
  });

  it('moves the card in the cache before the request goes out', async () => {
    // Without this the plan re-renders from the old server data and the card visibly snaps back to
    // where it started, because dnd-kit has already moved the DOM node.
    const { layout, result } = setup();

    await act(async () => {
      result.current.moveMeal({ id: 2, position: 0, toDay: '2026-08-04' });
    });

    expect(layout()).toEqual({ '2026-08-03': [1, 3], '2026-08-04': [2, 4] });
  });

  it('appends to the target day when no index was named', async () => {
    const { layout, result } = setup();

    await act(async () => {
      result.current.moveMeal({ id: 1, toDay: '2026-08-04' });
    });

    expect(layout()).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [4, 1] });
  });

  it('writes into the window the hook was given', async () => {
    // The cache is keyed by `from`/`to`, so writing to any other key leaves the card sitting still
    // until the refetch lands.
    const { layout, result } = setup();

    await act(async () => {
      result.current.moveMeal({ id: 4, position: 0, toDay: '2026-08-03' });
    });

    expect(layout()['2026-08-03']).toEqual([4, 1, 2, 3]);
  });
});
