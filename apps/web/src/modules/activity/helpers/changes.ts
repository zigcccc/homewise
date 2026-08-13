import z from 'zod';

import { formatDate, formatDateTime } from '@/modules/shared';

import { type ActivityEntry } from '../activity.queries';

/** One logged column change, as the server stored it. Derived, so a wire change fails the build here. */
type FieldChange = ActivityEntry['changes'][number];

/** Only the columns {@link humanize} gets wrong — abbreviations, and names describing the storage. */
const FIELD_LABELS: Record<string, string> = {
  archived: 'Archived',
  borrowedByName: 'Borrowed by',
  completedAt: 'Done',
  isFavorite: 'Favourite',
  medicalIdNumber: 'Medical ID',
  memberIds: 'Who is eating',
  nationalId: 'National ID',
  paidBackAt: 'Paid back',
  photoUrl: 'Photo',
  profilePicture: 'Photo',
  taxId: 'Tax ID',
};

/** `dateOfBirth` → "Date of birth". A trailing `Id`/`At` names the storage, not the thing. */
const humanize = (field: string) =>
  field
    .replace(/(Id|At)$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
    .replace(/^./, (first) => first.toUpperCase());

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? humanize(field);

const isoDay = z.iso.date();
const isoTimestamp = z.iso.datetime();

/**
 * A stored value as a member reads it. Dates are why this isn't a `String()`: they must come out
 * day-first. `undefined` is a field with no value worth showing, which tells a line to name it and stop.
 */
export function readValue(value: FieldChange['from']) {
  if (value === undefined) {
    return undefined;
  }

  // Spelled out rather than a dash: "Sex — → male" reads as punctuation gone wrong.
  if (value === null || value === '') {
    return 'No value';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (isoDay.safeParse(value).success) {
    return formatDate(value) ?? value;
  }

  return isoTimestamp.safeParse(value).success ? (formatDateTime(value) ?? value) : value;
}

/**
 * One line's diff: a field appears once, showing the **first** `from` against the **last** `to` —
 * the only pair that describes a folded run rather than one keystroke in the middle of it. A field
 * that ended where it began is dropped.
 */
export function collapseChanges(changes: FieldChange[]) {
  const byField = new Map<string, FieldChange>();

  for (const change of changes) {
    const started = byField.get(change.field);

    byField.set(change.field, started === undefined ? change : { ...started, to: change.to });
  }

  return [...byField.values()].filter((change) => !('from' in change && 'to' in change && change.from === change.to));
}
