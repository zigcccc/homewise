import { describe, expect, it } from 'vitest';

import { collapseChanges, fieldLabel, readValue } from './changes';

/**
 * The half of the feature that turns a stored diff into something a member reads. Pure, and the
 * place the two things E2E can't see live: how a folded run's edits collapse back into one pair, and
 * that a date comes out day-first rather than through whatever `new Date()` would make of it.
 */

describe('fieldLabel', () => {
  it.each([
    ['dateOfBirth', 'Date of birth'],
    ['cookTimeMinutes', 'Cook time minutes'],
    ['name', 'Name'],
  ])('should turn the column %s into "%s"', (field, expected) => {
    expect(fieldLabel(field)).toBe(expected);
  });

  it.each([
    // How a column stores something is not what a member calls it.
    ['locationId', 'Location'],
    ['completedAt', 'Done'],
    // An abbreviation the humanizer would lowercase.
    ['nationalId', 'National ID'],
  ])('should not let %s read as its column name', (field, expected) => {
    expect(fieldLabel(field)).toBe(expected);
  });
});

describe('readValue', () => {
  it('should render a stored date day-first', () => {
    // The trap this exists for: 03. 07. would come back as 7 March through a month-first reading.
    expect(readValue('2019-07-03')).toBe('03. 07. 2019');
  });

  it('should render a timestamp with the time on it', () => {
    expect(readValue('2026-08-13T09:00:00.000Z')).toContain('13. 08. 2026');
  });

  it.each([
    // Spelled out, not a dash: "Sex — → male" reads as a typo rather than as a field being filled in.
    ['a cleared field', null, 'No value'],
    ['an emptied one', '', 'No value'],
    ['a toggle that is on', true, 'Yes'],
    ['a toggle that is off', false, 'No'],
    ['an amount', 62.15, '62.15'],
  ])('should render %s as "%s"', (_what, value, expected) => {
    expect(readValue(value)).toBe(expected);
  });

  it('should have nothing to render for a field carrying no value', () => {
    // A foreign key, a photo, an identity number: the field names itself and stops.
    expect(readValue(undefined)).toBeUndefined();
  });

  it('should hand a long value over whole, for the layout to cut', () => {
    // Where a line ends is a question about the width it is rendered at, which this cannot see — so
    // the value stays intact and CSS ellipsises it.
    const long = 'x'.repeat(200);

    expect(readValue(long)).toBe(long);
  });
});

describe('collapseChanges', () => {
  it('should report where a field started and where it ended', () => {
    // GIVEN: a folded run that moved one field twice and another once
    const collapsed = collapseChanges([
      { field: 'cookTimeMinutes', from: 30, to: 40 },
      { field: 'servings', from: 4, to: 6 },
      { field: 'cookTimeMinutes', from: 40, to: 45 },
    ]);

    // THEN: each field should appear once, spanning the whole run — the pair in the middle describes
    // a keystroke, not what the household did
    expect(collapsed).toStrictEqual([
      { field: 'cookTimeMinutes', from: 30, to: 45 },
      { field: 'servings', from: 4, to: 6 },
    ]);
  });

  it('should keep the order the fields were first touched in', () => {
    const collapsed = collapseChanges([
      { field: 'notes', from: null, to: 'Shelf 2' },
      { field: 'name', from: 'Drill', to: 'Cordless drill' },
    ]);

    expect(collapsed.map((change) => change.field)).toStrictEqual(['notes', 'name']);
  });

  it('should drop a field that was put back the way it was', () => {
    // Renaming something and undoing it within the hour is not a change anyone needs to read about.
    expect(
      collapseChanges([
        { field: 'name', from: 'Drill', to: 'Hammer' },
        { field: 'name', from: 'Hammer', to: 'Drill' },
      ])
    ).toStrictEqual([]);
  });

  it('should keep a field that carries no values at all', () => {
    // GIVEN: a photo change, which is named rather than quoted
    const collapsed = collapseChanges([{ field: 'profilePicture' }]);

    // THEN: it must survive — both values being absent is not the same as both being equal, and
    // treating it as one would silence every photo, foreign key and ingredient edit
    expect(collapsed).toStrictEqual([{ field: 'profilePicture' }]);
  });

  it('should have nothing to show for a line that took no diff', () => {
    expect(collapseChanges([])).toStrictEqual([]);
  });
});
