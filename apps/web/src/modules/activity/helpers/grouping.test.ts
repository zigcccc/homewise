import { subDays, subHours } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { type ActivityEntry } from '../activity.queries';
import { dayHeading, groupByDay } from './grouping';

/**
 * The feed's day headings. Pure, and worth pinning: the grouping walks an already-ordered list and
 * relies on that order, so it breaks quietly rather than loudly if it ever stops holding.
 */

/**
 * A feed row with only the fields under test meaningful. `satisfies` so it can't drift from the API.
 * `lastAt` is when the line last happened and `startedAt` when its run began — the same instant for
 * every row that never folded.
 */
const entryAt = (lastAt: Date, id: number, startedAt: Date = lastAt) =>
  ({
    id,
    createdAt: startedAt.toISOString(),
    householdId: 1,
    actorId: 'user-1',
    actorName: 'Test Owner',
    entity: 'contact',
    operation: 'create',
    entityId: null,
    parentId: null,
    label: `Thing ${id}`,
    count: 1,
    changes: [],
    updatedAt: lastAt.toISOString(),
  }) satisfies ActivityEntry;

describe('dayHeading', () => {
  it('should name today by name rather than by date', () => {
    expect(dayHeading(subHours(new Date(), 2).toISOString())).toBe('Today');
  });

  it('should name yesterday by name too', () => {
    expect(dayHeading(subDays(new Date(), 1).toISOString())).toBe('Yesterday');
  });

  it('should fall back to the day-first date for anything older', () => {
    // GIVEN: a change from a week ago
    const heading = dayHeading(new Date('2026-03-07T10:00:00.000Z').toISOString());

    // THEN: it should read as every other date in the app does — day first, both parts padded
    expect(heading).toBe('07. 03. 2026');
  });
});

describe('groupByDay', () => {
  it('should gather consecutive rows from the same day under one heading', () => {
    // GIVEN: three changes today and one yesterday, newest first as the server returns them
    const entries = [
      entryAt(subHours(new Date(), 1), 4),
      entryAt(subHours(new Date(), 2), 3),
      entryAt(subHours(new Date(), 3), 2),
      entryAt(subDays(new Date(), 1), 1),
    ];

    // WHEN: they are grouped
    const groups = groupByDay(entries);

    // THEN: today's three should sit together, ahead of yesterday's one
    expect(groups.map((group) => group.heading)).toStrictEqual(['Today', 'Yesterday']);
    expect(groups[0]?.entries.map((entry) => entry.id)).toStrictEqual([4, 3, 2]);
    expect(groups[1]?.entries.map((entry) => entry.id)).toStrictEqual([1]);
  });

  it('should keep the order it was given inside a group', () => {
    // GIVEN: two changes today, newest first
    const entries = [entryAt(subHours(new Date(), 1), 2), entryAt(subHours(new Date(), 5), 1)];

    // WHEN: they are grouped
    const groups = groupByDay(entries);

    // THEN: the server's ordering should survive — grouping must never re-sort, or a page boundary
    // landing mid-day would shuffle rows the cursor had already placed
    expect(groups[0]?.entries.map((entry) => entry.id)).toStrictEqual([2, 1]);
  });

  it('should file a folded run under the day it last happened', () => {
    // GIVEN: a run that began yesterday evening and was last added to this morning
    const entries = [entryAt(subHours(new Date(), 1), 1, subDays(new Date(), 1))];

    // WHEN: it is grouped
    const groups = groupByDay(entries);

    // THEN: it should sit under today — dating it by when the run started would put a line the feed
    // shows as "an hour ago" under yesterday's heading
    expect(groups.map((group) => group.heading)).toStrictEqual(['Today']);
  });

  it('should give an empty feed no groups at all', () => {
    expect(groupByDay([])).toStrictEqual([]);
  });
});
