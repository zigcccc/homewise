import { describe, expect, it } from 'vitest';

import {
  eligibleMembers,
  groupIntoWeeks,
  resolveMealMove,
  stillNeedsAMeal,
  unassignedMembers,
} from './meal-plan.helpers';

/** A day as `resolveMealMove` reads one: its date, and the ids it currently holds in order. */
const day = (date: string, ids: number[]) => ({ day: date, meals: ids.map((id) => ({ id })) });

describe('resolveMealMove', () => {
  const days = [day('2026-08-03', [1, 2, 3]), day('2026-08-04', [4])];

  it('reports the day and index a card was dropped into', () => {
    const after = { '2026-08-03': [1, 3], '2026-08-04': [4, 2] };

    expect(resolveMealMove(days, after, 2)).toEqual({ position: 1, toDay: '2026-08-04' });
  });

  it('reports a reorder within the same day', () => {
    const after = { '2026-08-03': [2, 1, 3], '2026-08-04': [4] };

    expect(resolveMealMove(days, after, 1)).toEqual({ position: 1, toDay: '2026-08-03' });
  });

  it('reports nothing when the card ended where it started', () => {
    // A drag that changed nothing must not cost a request — or a toast when that request fails.
    const after = { '2026-08-03': [1, 2, 3], '2026-08-04': [4] };

    expect(resolveMealMove(days, after, 2)).toBeNull();
  });

  it('reports the index the card landed on in its new day', () => {
    expect(resolveMealMove(days, { '2026-08-03': [2, 3], '2026-08-04': [1, 4] }, 1)).toEqual({
      position: 0,
      toDay: '2026-08-04',
    });
    expect(resolveMealMove(days, { '2026-08-03': [2, 3], '2026-08-04': [4, 1] }, 1)).toEqual({
      position: 1,
      toDay: '2026-08-04',
    });
  });

  it('reports a move into an empty day', () => {
    const withEmpty = [...days, day('2026-08-05', [])];
    const after = { '2026-08-03': [1, 2], '2026-08-04': [4], '2026-08-05': [3] };

    expect(resolveMealMove(withEmpty, after, 3)).toEqual({ position: 0, toDay: '2026-08-05' });
  });

  it('reports nothing for an id that appears in no day', () => {
    // A cancelled or stale drop, and the reason the loop can't assume it will find the card.
    expect(resolveMealMove(days, { '2026-08-03': [1, 2, 3], '2026-08-04': [4] }, 99)).toBeNull();
  });

  it('reports a move even when the card was not in any day before', () => {
    const after = { '2026-08-03': [1, 2, 3, 9], '2026-08-04': [4] };

    expect(resolveMealMove(days, after, 9)).toEqual({ position: 3, toDay: '2026-08-03' });
  });
});

describe('unassignedMembers', () => {
  const members = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('names the members nothing feeds', () => {
    const meals = [{ members: [{ id: 1 }] }];

    expect(unassignedMembers(meals, members)).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it('treats a meal with no members as feeding everyone', () => {
    // "Pasta" with nobody named on it is dinner for the household, so nobody is still waiting.
    const meals = [{ members: [] }];

    expect(unassignedMembers(meals, members)).toEqual([]);
  });

  it('lets a members-less meal cover a day that also holds a targeted one', () => {
    const meals = [{ members: [{ id: 1 }] }, { members: [] }];

    expect(unassignedMembers(meals, members)).toEqual([]);
  });

  it('adds up across several meals', () => {
    const meals = [{ members: [{ id: 1 }] }, { members: [{ id: 2 }] }];

    expect(unassignedMembers(meals, members)).toEqual([{ id: 3 }]);
  });

  it('returns everyone for a day with no meals at all', () => {
    // The caller distinguishes this from a partly-planned day — an empty card already reads as unplanned.
    expect(unassignedMembers([], members)).toEqual(members);
  });

  it('returns nothing when everyone is fed', () => {
    const meals = [{ members: [{ id: 1 }, { id: 2 }, { id: 3 }] }];

    expect(unassignedMembers(meals, members)).toEqual([]);
  });
});

describe('stillNeedsAMeal', () => {
  it('is singular for one person', () => {
    expect(stillNeedsAMeal(['Robbie'])).toBe('Robbie still needs a meal');
  });

  it('is plural for two', () => {
    expect(stillNeedsAMeal(['Žiga', 'Ana'])).toBe('Žiga and Ana still need a meal');
  });

  it('uses a conjunction list for three or more', () => {
    expect(stillNeedsAMeal(['Žiga', 'Ana', 'Robbie'])).toBe('Žiga, Ana, and Robbie still need a meal');
  });
});

describe('eligibleMembers', () => {
  it('keeps the roles that eat off the plan', () => {
    const members = [
      { id: 1, role: 'adult' as const },
      { id: 2, role: 'child' as const },
      { id: 3, role: 'pet' as const },
      { id: 4, role: 'external' as const },
      { id: 5, role: null },
    ];

    expect(eligibleMembers(members).map(({ id }) => id)).toEqual([1, 2]);
  });

  it('drops a member with no role rather than throwing', () => {
    expect(eligibleMembers([{ role: null }])).toEqual([]);
  });
});

describe('groupIntoWeeks', () => {
  it('puts one ISO week in one group', () => {
    const days = ['2026-08-03', '2026-08-04', '2026-08-05'].map((date) => ({ day: date }));
    const weeks = groupIntoWeeks(days);

    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ end: '2026-08-05', start: '2026-08-03' });
  });

  it('splits on the Monday, not on a seven-day count', () => {
    // Sunday the 9th belongs to the week that began on the 3rd; Monday the 10th starts the next.
    const days = ['2026-08-08', '2026-08-09', '2026-08-10'].map((date) => ({ day: date }));
    const weeks = groupIntoWeeks(days);

    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.start).toBe('2026-08-03');
    expect(weeks[1]?.start).toBe('2026-08-10');
  });

  it('carries the end forward as days are added', () => {
    const days = ['2026-08-03', '2026-08-09'].map((date) => ({ day: date }));

    expect(groupIntoWeeks(days)[0]).toMatchObject({ end: '2026-08-09', start: '2026-08-03' });
  });

  it('handles an empty range', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });

  it('groups four weeks into four', () => {
    const days = Array.from({ length: 28 }, (_, index) => ({
      day: `2026-08-${String(3 + index).padStart(2, '0')}`,
    })).filter(({ day }) => day <= '2026-08-30');

    expect(groupIntoWeeks(days)).toHaveLength(4);
  });
});
