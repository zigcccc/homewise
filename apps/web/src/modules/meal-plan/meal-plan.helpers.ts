import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';

import { type HouseholdMemberRole } from '@homewise/server/households';
import { MEAL_ROLES } from '@homewise/server/meal-plan';

import { formatDate } from '@/modules/shared';

/** ISO weeks — a European calendar starts on Monday. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

/**
 * Local time, deliberately.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, so from midnight until the timezone offset flips
 * it names *tomorrow* — and this whole feature is `YYYY-MM-DD` strings, so "today" would highlight
 * the wrong day for anyone planning late on a Sunday night. For the same reason ISO strings are read
 * back with `parseISO` (local midnight) and never `new Date(string)`, which parses as UTC.
 */
const toISODate = (date: Date) => format(date, 'yyyy-MM-dd');

export const currentWeekStart = () => toISODate(startOfWeek(new Date(), WEEK_OPTIONS));

/** Snaps any date onto the Monday of its week, so the range always begins on one. */
export const toWeekStart = (iso: string) => toISODate(startOfWeek(parseISO(iso), WEEK_OPTIONS));

export const rangeFor = (from: string, weeks: number) => ({
  from,
  to: toISODate(addDays(parseISO(from), weeks * 7 - 1)),
});

export const shiftWeeks = (from: string, delta: number) => toISODate(addWeeks(parseISO(from), delta));

/** "Monday" — the day's name, which is what you scan a plan by. */
export const weekdayLabel = (iso: string) => format(parseISO(iso), 'EEEE');

/** "04. 08." — day-first, matching the tables' `dd. MM. yyyy`. */
export const dayLabel = (iso: string) => format(parseISO(iso), 'dd. MM.');

/**
 * "03. 08. 2026 – 09. 08. 2026" for a week header.
 *
 * Both endpoints in full: a week that crosses a month or a year names both sides of the boundary.
 */
export const rangeLabel = (from: string, to: string) => `${formatDate(from)} – ${formatDate(to)}`;

export const isToday = (iso: string) => iso === toISODate(new Date());

/**
 * Who eats off the plan — the roles, from the server, so this picker and the headcount a
 * shopping-list import scales to can't drift apart.
 */
export const eligibleMembers = <T extends { role: HouseholdMemberRole | null }>(members: T[]) =>
  members.filter((member) => member.role !== null && MEAL_ROLES.includes(member.role));

/**
 * The eligible members with nothing to eat on a day.
 *
 * A meal with no members means *everyone*, so one of those covers the whole day on its own. Empty
 * when the day is fully planned — and also when it holds no meals at all, which the caller
 * distinguishes: an empty card already reads as unplanned without being told who's missing.
 */
export function unassignedMembers<T extends { id: number }>(meals: { members: { id: number }[] }[], members: T[]) {
  if (meals.some((meal) => meal.members.length === 0)) {
    return [];
  }

  const fed = new Set(meals.flatMap((meal) => meal.members.map((member) => member.id)));

  return members.filter((member) => !fed.has(member.id));
}

const nameList = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** "Robbie still needs a meal" / "Žiga, Ana and Robbie still need a meal". */
export const stillNeedsAMeal = (names: string[]) =>
  `${nameList.format(names)} still ${names.length === 1 ? 'needs' : 'need'} a meal`;

/** Splits a flat run of days into weeks, so the list can carry a header per week. */
export function groupIntoWeeks<T extends { day: string }>(days: T[]) {
  const weeks: { start: string; end: string; days: T[] }[] = [];

  for (const day of days) {
    const start = toWeekStart(day.day);
    const current = weeks.at(-1);

    if (current?.start === start) {
      current.days.push(day);
      current.end = day.day;
    } else {
      weeks.push({ start, end: day.day, days: [day] });
    }
  }

  return weeks;
}
