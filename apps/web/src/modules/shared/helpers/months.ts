import { endOfMonth, format, getMonth, getYear, parseISO, startOfMonth } from 'date-fns';

/**
 * Calendar months, for any view that navigates by one — the URL carries a month and a year, the API
 * takes a plain date range.
 *
 * The split is deliberate and mirrors the meal plan's (`?from&weeks` in the URL, `?from&to` on the
 * wire): which month "today" falls in is a question only the client can answer, since the server's
 * clock is UTC and would be a day out for anyone east of it just after midnight. Everything here is
 * therefore local time, via date-fns — the server's own `#lib/dates` deliberately does the opposite.
 *
 * Months are **1–12** throughout, not date-fns' 0–11: these numbers go in the URL, where `?month=8`
 * has to read as August.
 */

const ISO_DAY_FORMAT = 'yyyy-MM-dd';

export const currentMonth = () => getMonth(new Date()) + 1;

export const currentYear = () => getYear(new Date());

/** Today as the API spells a day. Local, so it can't hand anyone east of UTC yesterday's date. */
export const todayISODay = () => format(new Date(), ISO_DAY_FORMAT);

export function monthRange(month: number, year: number) {
  const anchor = new Date(year, month - 1, 1);

  return { from: format(startOfMonth(anchor), ISO_DAY_FORMAT), to: format(endOfMonth(anchor), ISO_DAY_FORMAT) };
}

/** "August 2026" — how a page names the window it's showing. */
export const monthLabel = (month: number, year: number) => format(new Date(year, month - 1, 1), 'LLLL yyyy');

/**
 * The twelve months, for a switcher. Anchored to an arbitrary year rather than today, because
 * setting the month on *today* rolls a 31st over into the next one.
 */
export const monthOptions = () =>
  Array.from({ length: 12 }, (_, index) => ({
    label: format(new Date(2000, index, 1), 'LLLL'),
    value: index + 1,
  }));

/**
 * Every year back to `since`, newest first. Clamped at zero: a date in a later year than today is
 * impossible in principle and reachable through clock skew, and `Array.from({ length: -1 })` throws.
 */
export function yearOptions(since: string) {
  const thisYear = getYear(new Date());
  const span = Math.max(0, thisYear - getYear(parseISO(since)));

  return Array.from({ length: span + 1 }, (_, index) => thisYear - index);
}
