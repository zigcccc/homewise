/**
 * An accessible-name matcher anchored at the start.
 *
 * Several controls carry more than the name they're found by — a shopping-list row's label button
 * picks up the amount beside it, a breakdown chip its total — so those locators need a prefix match,
 * which Playwright only offers via a regular expression. Building one by interpolation means the
 * caller's text is read as a *pattern*: a category called `C++` or an item called `Milk (2 l)` either
 * throws or matches the wrong control. Escaping first keeps it text.
 */
export function nameStartsWith(text: string) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

/**
 * Every word the sort-direction toggle is allowed to carry: A → Z for a text column, oldest-first
 * for a date one. It's one vocabulary across the whole app, so it's one matcher here — a list that
 * invented its own wording would stop being found by it.
 */
export const SORT_DIRECTION_NAME = /A → Z|Z → A|Oldest first|Newest first/;
