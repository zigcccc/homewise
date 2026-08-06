import { describe, expect, it } from 'vitest';

import { type RecipeDetail } from '../recipes.queries';
import { groupBySection } from './ingredient-groups';

type Line = RecipeDetail['ingredients'][number];

const TIMESTAMPS = { createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' };

let nextId = 1;

const line = (name: string, section: string | null) => {
  const id = nextId++;

  return {
    ...TIMESTAMPS,
    id,
    ingredient: {
      ...TIMESTAMPS,
      category: 'other',
      defaultUnit: null,
      householdId: 1,
      id,
      name,
      notes: null,
      storeId: null,
    },
    ingredientId: id,
    note: null,
    position: id,
    quantity: null,
    recipeId: 1,
    section,
    unit: null,
  } satisfies Line;
};

const shape = (groups: ReturnType<typeof groupBySection>) =>
  groups.map(({ lines, section }) => [section, lines.map((row) => row.ingredient.name)]);

describe('groupBySection', () => {
  it('should group lines under their heading', () => {
    // GIVEN: two lines under one heading and one under another
    const groups = groupBySection([
      line('Flour', 'For the dough'),
      line('Water', 'For the dough'),
      line('Walnuts', 'For the filling'),
    ]);

    // THEN: each heading should carry its own lines
    expect(shape(groups)).toEqual([
      ['For the dough', ['Flour', 'Water']],
      ['For the filling', ['Walnuts']],
    ]);
  });

  it('should merge only adjacent lines', () => {
    // GIVEN: a list that returns to an earlier heading
    const groups = groupBySection([
      line('Flour', 'For the dough'),
      line('Walnuts', 'For the filling'),
      line('Water', 'For the dough'),
    ]);

    // THEN: it should yield two groups with the same name — the cook's ordering is the source of
    // truth, not the section name
    expect(shape(groups)).toEqual([
      ['For the dough', ['Flour']],
      ['For the filling', ['Walnuts']],
      ['For the dough', ['Water']],
    ]);
  });

  it('should treat lines with no heading as their own group', () => {
    expect(shape(groupBySection([line('Salt', null), line('Pepper', null)]))).toEqual([[null, ['Salt', 'Pepper']]]);
  });

  it('should keep an unheaded run separate from a headed one', () => {
    expect(shape(groupBySection([line('Salt', null), line('Flour', 'For the dough')]))).toEqual([
      [null, ['Salt']],
      ['For the dough', ['Flour']],
    ]);
  });

  it('should preserve the saved order within a group', () => {
    expect(shape(groupBySection([line('Water', 'Dough'), line('Flour', 'Dough')]))).toEqual([
      ['Dough', ['Water', 'Flour']],
    ]);
  });

  it('should handle a recipe with no ingredients', () => {
    expect(groupBySection([])).toEqual([]);
  });
});
