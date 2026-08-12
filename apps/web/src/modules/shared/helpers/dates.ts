import {
  differenceInCalendarDays,
  differenceInYears,
  endOfMonth,
  format,
  getMonth,
  getYear,
  isFuture,
  isValid,
  parse,
  parseISO,
  setYear,
  startOfDay,
  startOfMonth,
} from 'date-fns';

/**
 * Everything the web does with a date: how one is rendered, and the month/year arithmetic the views
 * that navigate by month need.
 *
 * All of it is **local time**, via date-fns — deliberately the opposite of the server's `#lib/dates`,
 * which is UTC. Which day *the user* is currently having is a client question: the server's clock is
 * UTC and would be a day out for anyone east of it just after midnight. The client always sends
 * explicit dates, so the two never have to agree about "today".
 */

/**
 * The one date display format in the app — day-first European, both tokens zero-padded.
 *
 * `DateField` renders *and* re-parses against this, so a date typed back in is the same string it
 * was shown as. Anything user-facing goes through `formatDate`/`formatDateTime` rather than
 * re-declaring the tokens: a stray `d` or `M` renders "6. 4." beside every other table's "06. 04.".
 */
export const DATE_DISPLAY_FORMAT = 'dd. MM. yyyy';

/** Minutes are lowercase `mm` — uppercase `MM` is the month, and renders "14:08" as "14:04". */
const DATE_TIME_DISPLAY_FORMAT = `${DATE_DISPLAY_FORMAT} @ HH:mm`;

/** How the API spells a day, on both sides of the wire. */
const ISO_DAY_FORMAT = 'yyyy-MM-dd';

/**
 * Strings are read with `parseISO`, never `new Date(string)`: the latter reads a bare `YYYY-MM-DD`
 * as UTC midnight, so west of Greenwich a birth date renders as the day before.
 *
 * Returns `null` for an absent or unparseable value — `format` throws on an invalid date, and these
 * come from timestamps, nullable columns and form fields that can be empty.
 */
function formatWith(value: string | Date | null | undefined, pattern: string) {
  if (!value) {
    return null;
  }

  const date = typeof value === 'string' ? parseISO(value) : value;

  return isValid(date) ? format(date, pattern) : null;
}

/** "06. 04. 2099" — a day, as every table and form shows one. */
export const formatDate = (value: string | Date | null | undefined) => formatWith(value, DATE_DISPLAY_FORMAT);

/** "06. 04. 2099 @ 14:08" — for the timestamps where the time of day is the point. */
export const formatDateTime = (value: string | Date | null | undefined) => formatWith(value, DATE_TIME_DISPLAY_FORMAT);

/**
 * Accepted typing formats, tried in order — the display format first, so what a field renders is
 * always something it takes back. Day-first throughout: `new Date()` would read "03. 07. 2026" as
 * 7 March (US month-first), which is the wrong reading here.
 */
const DATE_INPUT_FORMATS = [
  DATE_DISPLAY_FORMAT,
  'd. M. yyyy',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'yyyy-MM-dd',
  'd MMMM yyyy',
  'd MMM yyyy',
];

/**
 * Parses day-first input — the counterpart of `formatDate`, and here beside it so the pair can't
 * drift. Returns undefined for anything unparseable or out of range (31. 02.), and — unless
 * `allowFuture` — for anything ahead of today, matching the calendar's `after` limit.
 */
export function parseDayFirst(input: string, allowFuture: boolean) {
  const trimmed = input.trim();

  for (const dateFormat of DATE_INPUT_FORMATS) {
    const parsed = parse(trimmed, dateFormat, new Date());

    if (isValid(parsed) && (allowFuture || !isFuture(parsed))) {
      return parsed;
    }
  }

  return undefined;
}

/** Today as the API spells a day. Local, so it can't hand anyone east of UTC yesterday's date. */
export const todayISODay = () => format(new Date(), ISO_DAY_FORMAT);

/**
 * Whole years since `since` — how old a kid or a pet is. `null` when the date is absent, unparseable
 * or in the future, so a profile without a usable birth date shows no age rather than a negative one.
 * `DateField` won't accept a future date, but stored data can still carry one.
 */
export function ageInYears(since: string | null | undefined) {
  if (!since) {
    return null;
  }

  const date = parseISO(since);

  return isValid(date) && !isFuture(date) ? differenceInYears(new Date(), date) : null;
}

/**
 * When someone's next birthday falls, how far off it is, and the age it brings. `null` for an
 * absent, unparseable or future date, like `ageInYears`.
 *
 * Both sides are floored to the day, or a birthday falling today reads as already gone from 00:01.
 * A 29 February birth date lands on 1 March in a common year — `setFullYear` rolls it, and that
 * matches how `ContactsService` already orders birthdays in SQL.
 */
export function nextBirthday(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) {
    return null;
  }

  const born = parseISO(dateOfBirth);

  if (!isValid(born) || isFuture(born)) {
    return null;
  }

  const today = startOfDay(new Date());
  const thisYear = startOfDay(setYear(born, getYear(today)));
  // Been and gone already this year, so the next one round is next year's.
  const date = thisYear < today ? startOfDay(setYear(born, getYear(today) + 1)) : thisYear;

  return { date, inDays: differenceInCalendarDays(date, today), turning: getYear(date) - getYear(born) };
}

/** A day count as words. "in 0 days" is not how anyone says it. */
export function countdownLabel(inDays: number) {
  if (inDays === 0) {
    return 'Today';
  }

  return inDays === 1 ? 'Tomorrow' : `in ${inDays} days`;
}

/**
 * Months are **1–12** throughout, not date-fns' 0–11: these numbers go in the URL, where `?month=8`
 * has to read as August.
 */
export const currentMonth = () => getMonth(new Date()) + 1;

export const currentYear = () => getYear(new Date());

/** A month, as the plain date range the API takes. The URL carries the month and year instead. */
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
