import { formatDistance, parseISO } from 'date-fns';

import { formatDateTime } from '../helpers';
import { useNow } from '../hooks';

/**
 * "9 minutes ago", and still true a quarter of an hour later — it re-renders off {@link useNow}
 * rather than being formatted once and left there.
 *
 * `formatDistance` against that clock rather than `formatDistanceToNow`, so what is rendered is a
 * function of the tick and not of whenever React happened to run. The exact moment is on the `title`
 * and in `dateTime`: an age is the useful reading, but it is never the precise one.
 */
export function TimeAgo({ className, value }: { className?: string; value: string }) {
  const now = useNow();

  return (
    <time className={className} dateTime={value} title={formatDateTime(value) ?? undefined}>
      {formatDistance(parseISO(value), now, { addSuffix: true })}
    </time>
  );
}
