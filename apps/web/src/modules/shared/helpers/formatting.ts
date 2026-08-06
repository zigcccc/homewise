/**
 * Rendering a value as the string a person reads — everything except dates, which are `dates.ts`.
 */

/**
 * The one locale the app formats numbers in, fixed for the same reason `DATE_DISPLAY_FORMAT` is: two
 * members of one household reading the same total should read the same string, and a browser-derived
 * locale would render it "€87.40" for one of them and "87,40 €" for the other — beside dates that are
 * day-first either way.
 */
const NUMBER_DISPLAY_LOCALE = 'sl-SI';

/**
 * "87,40 €" — money, in the currency the row was logged in.
 *
 * The one money formatter in the app. The currency is per-row rather than global because a household
 * can change what it counts in, and past expenses keep what they were recorded as.
 */
export const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat(NUMBER_DISPLAY_LOCALE, { currency, style: 'currency' }).format(amount);

/**
 * Reads an amount a person typed. Accepts a decimal comma as well as a point — the display format
 * uses a comma, so typing back what you were shown has to work — and rejects anything that isn't a
 * plain number, including the empty string.
 *
 * Returns `null` rather than `NaN` for junk, so callers have to deal with it.
 */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(',', '.');

  if (normalized === '' || !/^\d*\.?\d*$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

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
