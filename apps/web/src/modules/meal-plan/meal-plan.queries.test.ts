import { describe, expect, it } from 'vitest';

import { type MealPlanRange, moveMealInRange, toDaysWithMeals } from './meal-plan.queries';

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

function range(meals: MealPlanRange['meals'], days = ['2026-08-03', '2026-08-04']) {
  return {
    days: days.map((day) => ({ day, note: null })),
    from: days.at(0) ?? '',
    meals,
    to: days.at(-1) ?? '',
  } satisfies MealPlanRange;
}

/**
 * What the plan actually renders: which day holds which cards, in which order. `toDaysWithMeals`
 * regroups by `day` and keeps array order, so this is what a move has to get right.
 */
const layout = (result: MealPlanRange) =>
  Object.fromEntries(toDaysWithMeals(result).map((day) => [day.day, day.meals.map(({ id }) => id)]));

const meals = [meal(1, '2026-08-03', 0), meal(2, '2026-08-03', 1), meal(3, '2026-08-03', 2), meal(4, '2026-08-04', 0)];

describe('moveMealInRange', () => {
  it('moves a meal to another day at the requested index', () => {
    const result = moveMealInRange(range(meals), { id: 1, position: 0, toDay: '2026-08-04' });

    expect(layout(result)).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [1, 4] });
  });

  it('reorders within a day', () => {
    const result = moveMealInRange(range(meals), { id: 3, position: 0, toDay: '2026-08-03' });

    expect(layout(result)).toEqual({ '2026-08-03': [3, 1, 2], '2026-08-04': [4] });
  });

  it('appends when no position is given', () => {
    const result = moveMealInRange(range(meals), { id: 1, toDay: '2026-08-04' });

    expect(layout(result)).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [4, 1] });
  });

  it('puts a position past the end of the day at the end', () => {
    const result = moveMealInRange(range(meals), { id: 1, position: 99, toDay: '2026-08-04' });

    expect(layout(result)).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [4, 1] });
  });

  it('puts a negative position at the front', () => {
    const result = moveMealInRange(range(meals), { id: 1, position: -5, toDay: '2026-08-04' });

    expect(layout(result)).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [1, 4] });
  });

  it('moves into a day that holds nothing', () => {
    const result = moveMealInRange(range(meals, ['2026-08-03', '2026-08-04', '2026-08-05']), {
      id: 1,
      position: 0,
      toDay: '2026-08-05',
    });

    expect(layout(result)).toEqual({ '2026-08-03': [2, 3], '2026-08-04': [4], '2026-08-05': [1] });
  });

  it('moves the last meal out of a day', () => {
    const result = moveMealInRange(range(meals), { id: 4, position: 0, toDay: '2026-08-03' });

    expect(layout(result)).toEqual({ '2026-08-03': [4, 1, 2, 3], '2026-08-04': [] });
  });

  it('leaves the range untouched for an id it does not hold', () => {
    // A stale drop, or a meal another member deleted while the card was in the air.
    const original = range(meals);

    expect(moveMealInRange(original, { id: 99, position: 0, toDay: '2026-08-04' })).toBe(original);
  });

  it('does not mutate the range it was given', () => {
    // It writes into a React Query cache, where mutating the previous value defeats the rollback.
    const original = range(meals);
    const before = JSON.stringify(original);

    moveMealInRange(original, { id: 1, position: 0, toDay: '2026-08-04' });

    expect(JSON.stringify(original)).toBe(before);
  });

  it('keeps every day the range covered', () => {
    const result = moveMealInRange(range(meals), { id: 1, position: 0, toDay: '2026-08-04' });

    expect(result.days.map((day) => day.day)).toEqual(['2026-08-03', '2026-08-04']);
  });

  it('numbers position within each day, not across the range', () => {
    // `position` means "index within the day" to everything that reads it — the server orders a day
    // by it, and the Undo-restore sends it back to put a card in the same slot. A flat index over the
    // concatenated list would hand those a number from a different scale.
    const result = moveMealInRange(range(meals), { id: 1, position: 0, toDay: '2026-08-04' });

    expect(result.meals.map((meal) => [meal.day, meal.position])).toEqual([
      ['2026-08-03', 0],
      ['2026-08-03', 1],
      ['2026-08-04', 0],
      ['2026-08-04', 1],
    ]);
  });

  it('closes the gap in the day the card left', () => {
    const result = moveMealInRange(range(meals), { id: 2, position: 0, toDay: '2026-08-04' });
    const source = result.meals.filter((meal) => meal.day === '2026-08-03');

    expect(source.map((meal) => [meal.id, meal.position])).toEqual([
      [1, 0],
      [3, 1],
    ]);
  });

  it('numbers a reorder within one day densely from zero', () => {
    const result = moveMealInRange(range(meals), { id: 3, position: 0, toDay: '2026-08-03' });

    expect(result.meals.filter((meal) => meal.day === '2026-08-03').map((meal) => [meal.id, meal.position])).toEqual([
      [3, 0],
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('toDaysWithMeals', () => {
  it('stitches the flat meals list back onto its days', () => {
    expect(layout(range(meals))).toEqual({ '2026-08-03': [1, 2, 3], '2026-08-04': [4] });
  });

  it('gives a day with no meals an empty list rather than undefined', () => {
    expect(toDaysWithMeals(range([], ['2026-08-03']))[0]?.meals).toEqual([]);
  });

  it('keeps every day the server sent, in order', () => {
    const days = ['2026-08-03', '2026-08-04', '2026-08-05'];

    expect(toDaysWithMeals(range([], days)).map((day) => day.day)).toEqual(days);
  });

  it('drops a meal whose day the range does not cover', () => {
    expect(layout(range([meal(9, '2026-09-01', 0)]))).toEqual({ '2026-08-03': [], '2026-08-04': [] });
  });
});
