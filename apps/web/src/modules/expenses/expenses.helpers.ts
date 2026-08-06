import z from 'zod';

import { createExpenseModel } from '@homewise/server/expenses';

import { parseAmount, todayISODay } from '@/modules/shared';

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
 * The date a new expense opens on: today while you're looking at this month, the 1st of whatever
 * month you're looking at otherwise — so logging into the month on screen needs no date fix.
 */
export function defaultRecordedAt(from: string) {
  const today = todayISODay();

  return today.slice(0, 7) === from.slice(0, 7) ? today : from;
}
