/**
 * Radix `Select` reserves the empty string to mean "no item selected", so it can't be used as an
 * item's value. Anything that has to be selectable but maps to *no value* travels as one of these
 * sentinels and is mapped back at the boundary:
 *
 * - `SELECT_ALL` — a filter's "any" option, mapped to `undefined` so it drops out of the query string
 * - `SELECT_NONE` — a form field's "not set" option, mapped to `null` so the save clears the column
 */
export const SELECT_ALL = 'all';
export const SELECT_NONE = 'none';
