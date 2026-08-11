import { type ComponentProps } from 'react';

import { type SortDirection } from '@homewise/server/models';
import { Button } from '@homewise/ui/core';

/** How each direction reads. Words, not an icon — see `SORT_LABELS`. */
export type SortDirectionLabels = Record<SortDirection, string>;

/**
 * The ways ascending is allowed to read, one per kind of column we sort by. A list picks the pair
 * that matches its current sort key rather than wording its own, so the same control says the same
 * thing in the same words everywhere it appears — one pattern for the whole app, which is the point.
 *
 * `recurring` is for a date sorted by its next occurrence rather than by when it was: a birthday in
 * 1974 is not "older" than one in 2019, it is simply further round the year. "Oldest first" would be
 * an outright lie about that order.
 */
export const SORT_LABELS = {
  date: { asc: 'Oldest first', desc: 'Newest first' },
  recurring: { asc: 'Soonest first', desc: 'Furthest off' },
  text: { asc: 'A → Z', desc: 'Z → A' },
} satisfies Record<string, SortDirectionLabels>;

/**
 * The flip-the-sort button every list toolbar carries. It holds no state of its own: the direction
 * lives in the route's search params, so the view is shareable and survives a refresh.
 *
 * The text pair is the default because a list with no sort-key picker sorts by a name.
 */
export function SortDirectionToggle({
  labels = SORT_LABELS.text,
  onChange,
  value,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'onChange' | 'value'> & {
  labels?: SortDirectionLabels;
  onChange: (next: SortDirection) => void;
  value: SortDirection;
}) {
  return (
    <Button onClick={() => onChange(value === 'asc' ? 'desc' : 'asc')} variant="outline" {...props}>
      {labels[value]}
    </Button>
  );
}
