/**
 * Calendar arithmetic on bare `YYYY-MM-DD` strings, in UTC.
 *
 * UTC is the neutral basis here rather than a wrong one: these strings carry no time at all, and the
 * server only ever *stores and compares* them. Doing the maths in local time would skip or repeat a
 * day whenever a range crosses a DST boundary — "the last week of March renders six days" is the kind
 * of bug that surfaces twice a year and never in a test.
 *
 * The web deliberately does the opposite (`apps/web/src/modules/meal-plan/meal-plan.helpers.ts` uses
 * local time via date-fns), and the two are not in conflict: deciding which day *the user* is
 * currently having is a client question, and the client always sends explicit dates. Anything here
 * that reads the clock is a fallback for a request that named no dates at all.
 */

const parseISODate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const toISODate = (date: Date) => date.toISOString().slice(0, 10);

export const todayISO = () => toISODate(new Date());

export const addDays = (day: string, days: number) => {
  const date = parseISODate(day);
  date.setUTCDate(date.getUTCDate() + days);

  return toISODate(date);
};

/** The Monday of the week containing `day`. ISO weeks — Monday-first, as the rest of Europe counts. */
export const startOfISOWeek = (day: string) => {
  const date = parseISODate(day);
  // getUTCDay() is 0 for Sunday, which is the *end* of an ISO week, so it steps back six days.
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));

  return toISODate(date);
};

/** The first day of the month containing `day`. */
export const startOfMonth = (day: string) => `${day.slice(0, 7)}-01`;

/** The last day of the month containing `day` — 28th through 31st, leap years included. */
export const endOfMonth = (day: string) => {
  const date = parseISODate(day);
  // Day 0 of the *next* month is the last day of this one, which is what avoids a length table.
  date.setUTCMonth(date.getUTCMonth() + 1, 0);

  return toISODate(date);
};

/** Every day from `from` to `to`, both ends included. Empty when the range is inverted. */
export const eachDayInclusive = (from: string, to: string) => {
  const days: string[] = [];

  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
};
