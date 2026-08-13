import { formatDate, formatDateTime } from '@/modules/shared';

import { type ActivityEntry } from '../activity.queries';

/** One logged column change, as the server stored it. Derived, so a wire change fails the build here. */
type FieldChange = ActivityEntry['changes'][number];

/**
 * The words for a column, where the column name isn't already them.
 *
 * A lookup with a fallback rather than an exhaustive `Record`, unlike the entity nouns: these are
 * table columns across fourteen modules, and `humanize` is right for almost all of them. Only the
 * ones it gets wrong are listed — abbreviations it would lowercase, and names that describe the
 * storage rather than the thing.
 */
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

/**
 * `dateOfBirth` → "Date of birth". The trailing `Id`/`At` goes with it: those name how a column
 * stores something ("category id", "completed at"), never what a member calls it.
 */
const humanize = (field: string) =>
  field
    .replace(/(Id|At)$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
    .replace(/^./, (first) => first.toUpperCase());

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? humanize(field);

/** Long enough to recognise a note by, short enough that a line stays a line. */
const READABLE_LENGTH = 60;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

/**
 * A stored value as a member reads it. Dates are the reason this exists rather than a `String()`:
 * they are stored the way the column holds them and must come out day-first, never through
 * `new Date(input)` or a locale default.
 *
 * `undefined` is the field having no value worth showing — a foreign key, a photo, an identity
 * number — and is what tells a line to name the field and stop.
 */
export function readValue(value: FieldChange['from']) {
  if (value === undefined) {
    return undefined;
  }

  // Spelled out rather than a dash: "Sex — → male" reads as punctuation gone wrong, and the empty
  // side of a change is exactly where a reader needs the most help.
  if (value === null || value === '') {
    return 'No value';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (ISO_DAY.test(value)) {
    return formatDate(value) ?? value;
  }

  if (ISO_TIMESTAMP.test(value)) {
    return formatDateTime(value) ?? value;
  }

  return value.length > READABLE_LENGTH ? `${value.slice(0, READABLE_LENGTH)}…` : value;
}

/**
 * One line's diff, ready to read: a field appears once, showing where it started and where it ended.
 *
 * A folded run stores every edit in the order it happened, so five saves of one field are five
 * entries here. Collapsing takes the **first** `from` against the **last** `to`, which is the only
 * pair that describes the run rather than one keystroke in the middle of it — and drops a field that
 * ended where it began, since editing something back is not a change anyone needs to read about.
 */
export function collapseChanges(changes: FieldChange[]) {
  const byField = new Map<string, FieldChange>();

  for (const change of changes) {
    const started = byField.get(change.field);

    byField.set(change.field, started === undefined ? change : { ...started, to: change.to });
  }

  return [...byField.values()].filter((change) => !('from' in change && 'to' in change && change.from === change.to));
}
