import { format, isValid, parseISO } from 'date-fns';

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

/** "1 h 20 min" reads faster than "80 min" once you're past an hour. */
export function formatMinutes(minutes: number | null) {
  if (minutes === null || minutes === 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * How an attribution reads on one line: the given name when there is one, otherwise the URL's
 * hostname ("okusno.je"), since a full path is unreadable next to other metadata.
 *
 * Returns `null` when there is nothing to attribute.
 */
export function formatSource(sourceName: string | null, sourceUrl: string | null) {
  if (sourceName) {
    return sourceName;
  }

  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    // The server validates the URL, so this only trips on legacy or hand-edited data.
    return sourceUrl;
  }
}
