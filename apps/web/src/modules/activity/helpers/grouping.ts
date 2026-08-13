import { isToday, isYesterday, parseISO } from 'date-fns';

import { formatDate } from '@/modules/shared';

import { type ActivityEntry } from '../activity.queries';

/**
 * The heading a row sits under. "Today" and "Yesterday" by name because that is how anyone reads a
 * feed of their own week; everything older falls back to the app's one day-first format.
 */
export function dayHeading(timestamp: string) {
  const date = parseISO(timestamp);

  if (isToday(date)) {
    return 'Today';
  }

  return isYesterday(date) ? 'Yesterday' : (formatDate(date) ?? '');
}

/**
 * Splits an already-ordered feed into day groups, keeping the server's order within each.
 *
 * Grouping rather than sorting: the rows arrive newest-first from a keyset cursor, and re-sorting
 * here would fight that ordering and break as soon as a page boundary landed mid-day.
 *
 * `updatedAt` throughout, not `createdAt`: a line can stand for a run of edits, and the one worth
 * dating is the last of them. The order still holds, because a run only folds into the newest line.
 */
export function groupByDay(entries: ActivityEntry[]) {
  const groups: { heading: string; entries: ActivityEntry[] }[] = [];

  for (const entry of entries) {
    const heading = dayHeading(entry.updatedAt);
    const current = groups.at(-1);

    if (current?.heading === heading) {
      current.entries.push(entry);
    } else {
      groups.push({ heading, entries: [entry] });
    }
  }

  return groups;
}
