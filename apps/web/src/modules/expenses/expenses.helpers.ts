import { endOfMonth, format, getMonth, getYear, parseISO, startOfMonth } from 'date-fns';
import z from 'zod';

import { createExpenseModel } from '@homewise/server/expenses';

import { parseAmount } from '@/modules/shared';

/**
 * An amount as somebody types it, for the two editors that work in text: the form field and the
 * table's inline cell. Both have to accept a decimal comma, because that is how `formatAmount` shows
 * one back.
 *
 * Only the text/number translation is local — the bounds are the server's own `amount` schema, run
 * against the parsed value, so there is no second opinion about what a valid amount is.
 */
export const expenseAmountText = z.string().refine(
  (text) => {
    const parsed = parseAmount(text);

    return parsed !== null && createExpenseModel.shape.amount.safeParse(parsed).success;
  },
  { error: 'Enter an amount like 12,50' }
);

/**
 * The month/year the URL carries, translated into the plain date range the API takes.
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

export function monthRange(month: number, year: number) {
  const anchor = new Date(year, month - 1, 1);

  return { from: format(startOfMonth(anchor), ISO_DAY_FORMAT), to: format(endOfMonth(anchor), ISO_DAY_FORMAT) };
}

/**
 * The date a new expense opens on: today while you're looking at this month, the 1st of whatever
 * month you're looking at otherwise — so logging into the month on screen needs no date fix.
 *
 * Local time like everything else here. `toISOString()` would hand anyone east of UTC yesterday's
 * date for the first hours of every day, and get the month comparison wrong on the 1st.
 */
export function defaultRecordedAt(from: string) {
  const today = format(new Date(), ISO_DAY_FORMAT);

  return today.slice(0, 7) === from.slice(0, 7) ? today : from;
}

/** "August 2026" — how the page names the window it's showing. */
export const monthLabel = (month: number, year: number) => format(new Date(year, month - 1, 1), 'LLLL yyyy');

/**
 * The twelve months, for the switcher. Anchored to an arbitrary year rather than today, because
 * setting the month on *today* rolls a 31st over into the next one.
 */
export const monthOptions = () =>
  Array.from({ length: 12 }, (_, index) => ({
    label: format(new Date(2000, index, 1), 'LLLL'),
    value: index + 1,
  }));

/**
 * Every year the household could have spent anything in, newest first. Clamped at zero: a
 * `createdAt` in a later year than today is impossible in principle and reachable through clock skew,
 * and `Array.from({ length: -1 })` would throw.
 */
export function yearOptions(householdCreatedAt: string) {
  const thisYear = getYear(new Date());
  const span = Math.max(0, thisYear - getYear(parseISO(householdCreatedAt)));

  return Array.from({ length: span + 1 }, (_, index) => thisYear - index);
}
