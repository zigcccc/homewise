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

  it('should report the day and index a card was dropped into', () => {
    // GIVEN: meal 2 has moved to the end of the next day
    const after = { '2026-08-03': [1, 3], '2026-08-04': [4, 2] };

    // THEN: its new day and index should be reported
    expect(resolveMealMove(days, after, 2)).toEqual({ position: 1, toDay: '2026-08-04' });
  });

  it('should report a reorder within the same day', () => {
    const after = { '2026-08-03': [2, 1, 3], '2026-08-04': [4] };

    expect(resolveMealMove(days, after, 1)).toEqual({ position: 1, toDay: '2026-08-03' });
  });

  it('should report the index the card landed on in its new day', () => {
    expect(resolveMealMove(days, { '2026-08-03': [2, 3], '2026-08-04': [1, 4] }, 1)).toEqual({
      position: 0,
      toDay: '2026-08-04',
    });
    expect(resolveMealMove(days, { '2026-08-03': [2, 3], '2026-08-04': [4, 1] }, 1)).toEqual({
      position: 1,
      toDay: '2026-08-04',
    });
  });

  it('should report nothing when the card ended where it started', () => {
    // GIVEN: an arrangement identical to the one the day already had
    const after = { '2026-08-03': [1, 2, 3], '2026-08-04': [4] };

    // THEN: nothing should be reported — a drag that changed nothing must not cost a request, or a
    // failure toast when that request fails
    expect(resolveMealMove(days, after, 2)).toBeNull();
  });

  it('should report a move into an empty day', () => {
    const withEmpty = [...days, day('2026-08-05', [])];
    const after = { '2026-08-03': [1, 2], '2026-08-04': [4], '2026-08-05': [3] };

    expect(resolveMealMove(withEmpty, after, 3)).toEqual({ position: 0, toDay: '2026-08-05' });
  });

  it('should report nothing for an id that appears in no day', () => {
    // A cancelled or stale drop, and why the loop can't assume it will find the card.
    expect(resolveMealMove(days, { '2026-08-03': [1, 2, 3], '2026-08-04': [4] }, 99)).toBeNull();
  });

  it('should report a move even when the card was not in any day before', () => {
    const after = { '2026-08-03': [1, 2, 3, 9], '2026-08-04': [4] };

    expect(resolveMealMove(days, after, 9)).toEqual({ position: 3, toDay: '2026-08-03' });
  });
});

describe('unassignedMembers', () => {
  const members = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('should name the members nothing feeds', () => {
    expect(unassignedMembers([{ members: [{ id: 1 }] }], members)).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it('should treat a meal with no members as feeding everyone', () => {
    // "Pasta" with nobody named on it is dinner for the household, so nobody is still waiting.
    expect(unassignedMembers([{ members: [] }], members)).toEqual([]);
  });

  it('should let a members-less meal cover a day that also holds a targeted one', () => {
    expect(unassignedMembers([{ members: [{ id: 1 }] }, { members: [] }], members)).toEqual([]);
  });

  it('should add up across several meals', () => {
    expect(unassignedMembers([{ members: [{ id: 1 }] }, { members: [{ id: 2 }] }], members)).toEqual([{ id: 3 }]);
  });

  it('should return everyone for a day with no meals at all', () => {
    // The caller tells this apart from a partly-planned day — an empty card already reads as unplanned.
    expect(unassignedMembers([], members)).toEqual(members);
  });

  it('should return nothing when everyone is fed', () => {
    expect(unassignedMembers([{ members: [{ id: 1 }, { id: 2 }, { id: 3 }] }], members)).toEqual([]);
  });
});

describe('stillNeedsAMeal', () => {
  it('should be singular for one person', () => {
    expect(stillNeedsAMeal(['Robbie'])).toBe('Robbie still needs a meal');
  });

  it('should be plural for two', () => {
    expect(stillNeedsAMeal(['Žiga', 'Ana'])).toBe('Žiga and Ana still need a meal');
  });

  it('should use a conjunction list for three or more', () => {
    expect(stillNeedsAMeal(['Žiga', 'Ana', 'Robbie'])).toBe('Žiga, Ana, and Robbie still need a meal');
  });
});

describe('eligibleMembers', () => {
  it('should keep only the roles that eat off the plan', () => {
    // GIVEN: one member of every role
    const members = [
      { id: 1, role: 'adult' as const },
      { id: 2, role: 'child' as const },
      { id: 3, role: 'pet' as const },
      { id: 4, role: 'external' as const },
    ];

    // THEN: only the adult and the child should survive
    expect(eligibleMembers(members).map(({ id }) => id)).toEqual([1, 2]);
  });
});

describe('groupIntoWeeks', () => {
  it('should put one ISO week in one group', () => {
    const weeks = groupIntoWeeks(['2026-08-03', '2026-08-04', '2026-08-05'].map((date) => ({ day: date })));

    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ end: '2026-08-05', start: '2026-08-03' });
  });

  it('should split on the Monday rather than on a seven-day count', () => {
    // GIVEN: Saturday, Sunday and the Monday after
    const weeks = groupIntoWeeks(['2026-08-08', '2026-08-09', '2026-08-10'].map((date) => ({ day: date })));

    // THEN: the Sunday should stay with the week that began on the 3rd, and the Monday start a new one
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.start).toBe('2026-08-03');
    expect(weeks[1]?.start).toBe('2026-08-10');
  });

  it('should carry the end forward as days are added', () => {
    const weeks = groupIntoWeeks(['2026-08-03', '2026-08-09'].map((date) => ({ day: date })));

    expect(weeks[0]).toMatchObject({ end: '2026-08-09', start: '2026-08-03' });
  });

  it('should handle an empty range', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });

  it('should group four weeks into four', () => {
    const days = Array.from({ length: 28 }, (_, index) => ({
      day: `2026-08-${String(3 + index).padStart(2, '0')}`,
    })).filter(({ day }) => day <= '2026-08-30');

    expect(groupIntoWeeks(days)).toHaveLength(4);
  });
});
