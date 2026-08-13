import { formatDistance, parseISO } from 'date-fns';

import { formatDateTime } from '../helpers';
import { useNow } from '../hooks';

/**
 * "9 minutes ago", and still true a quarter of an hour later — it re-renders off {@link useNow}.
 * `formatDistance` against that clock, so what is rendered follows the tick rather than the render.
 */
export function TimeAgo({ className, value }: { className?: string; value: string }) {
  const now = useNow();

  return (
    <time className={className} dateTime={value} title={formatDateTime(value) ?? undefined}>
      {formatDistance(parseISO(value), now, { addSuffix: true })}
    </time>
  );
}
