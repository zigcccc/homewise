import { UTCDate } from '@date-fns/utc';
import {
  addDays as addDaysToDate,
  eachDayOfInterval,
  endOfMonth as endOfMonthOf,
  format,
  startOfISOWeek as startOfISOWeekOf,
  startOfMonth as startOfMonthOf,
} from 'date-fns';

/**
 * Calendar arithmetic on bare `YYYY-MM-DD` strings, in UTC.
 *
 * UTC is the neutral basis here rather than a wrong one: these strings carry no time at all, and the
 * server only ever *stores and compares* them. `UTCDate` is what pins it — every date-fns function
 * reads the calendar fields off the date it is given, so handing them a plain `Date` would do the
 * maths in whatever zone the process happens to run in.
 *
 * The web deliberately does the opposite (`apps/web/src/modules/shared/helpers` uses local time via
 * date-fns), and the two are not in conflict: deciding which day *the user* is currently having is a
 * client question, and the client always sends explicit dates. Anything here that reads the clock is
 * a fallback for a request that named no dates at all.
 */

const ISO_DAY = 'yyyy-MM-dd';

const toISODate = (date: Date) => format(date, ISO_DAY);

export const todayISO = () => toISODate(new UTCDate());

/**
 * Today as `MM-DD`, for the comparisons that are deliberately blind to the year — "whose birthday is
 * next" being the one. Compared against `to_char(column, 'MM-DD')` it orders the calendar correctly
 * without any date arithmetic, so 29 February needs no special case.
 */
export const todayMonthDay = () => format(new UTCDate(), 'MM-dd');

/**
 * A day as the app writes days, `dd. MM. yyyy` — the one place the server produces display text
 * rather than storing a date. Activity labels are snapshots, so what a line says is settled when it
 * is written; this keeps it saying the same thing the rest of the app does.
 */
export const formatDayFirst = (day: string) => format(new UTCDate(day), 'dd. MM. yyyy');

export const addDays = (day: string, days: number) => toISODate(addDaysToDate(new UTCDate(day), days));

/** The Monday of the week containing `day`. ISO weeks — Monday-first, as the rest of Europe counts. */
export const startOfISOWeek = (day: string) => toISODate(startOfISOWeekOf(new UTCDate(day)));

/** The first day of the month containing `day`. */
export const startOfMonth = (day: string) => toISODate(startOfMonthOf(new UTCDate(day)));

/** The last day of the month containing `day` — 28th through 31st, leap years included. */
export const endOfMonth = (day: string) => toISODate(endOfMonthOf(new UTCDate(day)));

/** Every day from `from` to `to`, both ends included. Empty when the range is inverted. */
export const eachDayInclusive = (from: string, to: string) =>
  from > to ? [] : eachDayOfInterval({ start: new UTCDate(from), end: new UTCDate(to) }).map(toISODate);

/**
 * A `from`/`to` window that is never inverted and never longer than `maxDays`.
 *
 * Clamped rather than refused, and shared by every ranged read (the meal plan, a shopping-list
 * import, a month of expenses) because they all made the same bargain for the same reason: a
 * hand-edited or stale link should show a sane window instead of a 400. What legitimately differs
 * between them is where the window *starts* and how long it runs by default, so each caller still
 * decides that and hands the result here.
 */
export const clampRange = (from: string, to: string, maxDays: number) => {
  const latest = addDays(from, maxDays - 1);

  if (to < from) {
    return { from, to: from };
  }

  return { from, to: to > latest ? latest : to };
};
