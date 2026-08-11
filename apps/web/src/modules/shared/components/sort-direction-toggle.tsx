import { type ComponentProps, type ReactNode } from 'react';

import { type SortDirection } from '@homewise/server/models';
import { Button } from '@homewise/ui/core';

/** How each direction reads. `ReactNode` so a toolbar that wants an arrow in there can put one. */
export type SortDirectionLabels = Record<SortDirection, ReactNode>;

/**
 * Ascending reads differently per column — A → Z for a name, oldest-first for a date — so the labels
 * are the caller's. These are the default because most lists here sort by a name.
 */
const defaultLabels: SortDirectionLabels = { asc: 'A → Z', desc: 'Z → A' };

/**
 * The flip-the-sort button every list toolbar carries. It holds no state of its own: the direction
 * lives in the route's search params, so the view is shareable and survives a refresh.
 */
export function SortDirectionToggle({
  labels = defaultLabels,
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
