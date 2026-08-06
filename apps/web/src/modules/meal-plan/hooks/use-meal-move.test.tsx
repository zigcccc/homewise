import { type Mutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { type MealPlanRange, mealPlanRangeQueryOptions, toDaysWithMeals } from '../meal-plan.queries';
import { useMealMove } from './use-meal-move';

/**
 * The optimistic write a move makes before its request goes out, and what it decides to send. E2E
 * only ever sees the plan once the refetch has landed, so the frame in between is this layer's.
 *
 * The request is left to fail against no server rather than being given a fake response, so every
 * assertion waits for it to settle and then reads the cache's *history* — the optimistic value is
 * gone from the cache itself by then, replaced by the rollback.
 */

const RANGE = { from: '2026-08-03', to: '2026-08-04' };

const AT_REST = { '2026-08-03': [1, 2, 3], '2026-08-04': [4] };

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

/** Which day holds which cards, as the plan would render them. */
const layoutOf = (range: MealPlanRange) =>
  Object.fromEntries(toDaysWithMeals(range).map((day) => [day.day, day.meals.map(({ id }) => id)]));

function setup() {
  const queryClient = new QueryClient({
    // One attempt, so the mutation reaches a terminal state the tests can wait on.
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

  // Every value the plan took, so an optimistic write can be asserted after its rollback has already
  // replaced it. Reading the cache at a moment in time is a race the CI runner wins.
  const history: Record<string, number[]>[] = [];
  queryClient.getQueryCache().subscribe(() => {
    const range = queryClient.getQueryData(key);

    if (range) {
      history.push(layoutOf(range));
    }
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMealMove(RANGE, toDaysWithMeals(plan())), { wrapper });

  /** Runs a move and waits for its request to fail, so nothing below is timing-dependent. */
  const move = async (variables: { id: number; position?: number; toDay: string }) => {
    await act(async () => result.current.moveMeal(variables));
    await waitFor(() => expect(enqueued.at(0)?.state.status).toBe('error'));
  };

  const layout = () => {
    const range = queryClient.getQueryData(key);

    if (!range) {
      throw new Error('The plan is no longer in the cache.');
    }

    return layoutOf(range);
  };

  return { history, layout, move, sent: () => enqueued.map((mutation) => mutation.state.variables) };
}

describe('moveMeal', () => {
  it('should send the day and index it was asked for', async () => {
    const { move, sent } = setup();

    await move({ id: 2, position: 0, toDay: '2026-08-04' });

    expect(sent()).toEqual([{ id: 2, position: 0, toDay: '2026-08-04' }]);
  });

  it('should leave the index out when the menu named only a day', async () => {
    const { move, sent } = setup();

    await move({ id: 1, toDay: '2026-08-04' });

    expect(sent()).toEqual([{ id: 1, toDay: '2026-08-04' }]);
  });

  it('should move the card in the cache before the request goes out', async () => {
    // GIVEN: a plan with three cards on the first day
    const { history, move } = setup();

    // WHEN: one is moved to the front of the second day
    await move({ id: 2, position: 0, toDay: '2026-08-04' });

    // THEN: the cache should have held the moved layout at some point — without it the plan
    // re-renders from the old server data and the card visibly snaps back, because dnd-kit has
    // already moved the DOM node
    expect(history).toContainEqual({ '2026-08-03': [1, 3], '2026-08-04': [2, 4] });
  });

  it('should append to the target day when no index was named', async () => {
    const { history, move } = setup();

    await move({ id: 1, toDay: '2026-08-04' });

    expect(history).toContainEqual({ '2026-08-03': [2, 3], '2026-08-04': [4, 1] });
  });

  it('should write into the window the hook was given', async () => {
    // GIVEN: a hook holding one from/to window
    const { history, move } = setup();

    // WHEN: a card is moved
    await move({ id: 4, position: 0, toDay: '2026-08-03' });

    // THEN: that window's cache entry should be the one that changed — the cache is keyed by
    // from/to, so writing anywhere else leaves the card sitting still until the refetch
    expect(history).toContainEqual({ '2026-08-03': [4, 1, 2, 3], '2026-08-04': [] });
  });

  it('should put the card back when the request fails', async () => {
    // GIVEN: a plan at rest
    const { layout, move } = setup();

    // WHEN: a move is made and its request fails
    await move({ id: 2, position: 0, toDay: '2026-08-04' });

    // THEN: the optimistic write should be undone, so the plan doesn't keep showing a change the
    // server never accepted
    expect(layout()).toEqual(AT_REST);
  });
});
