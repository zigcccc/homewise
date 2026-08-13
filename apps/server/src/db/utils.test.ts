import { describe, expect, it } from 'vitest';

import { changedColumns, emptyToNull, isUniqueViolation, sameList, writesAnything } from '#db/utils';

describe('emptyToNull', () => {
  it('should turn a cleared field into NULL', () => {
    expect(emptyToNull('')).toBeNull();
  });

  it('should pass an explicit null through', () => {
    expect(emptyToNull(null)).toBeNull();
  });

  it('should leave an omitted field omitted', () => {
    // Distinct from '': "don't touch this column", not "clear it".
    expect(emptyToNull(undefined)).toBeUndefined();
  });

  it.each([
    ['real text', 'notes'],
    ['a single space, which is a value the user typed', ' '],
  ])('should leave %s alone', (_what, value) => {
    expect(emptyToNull(value)).toBe(value);
  });
});

describe('writesAnything', () => {
  it.each([
    ['a PATCH that named no fields', {}],
    ['a patch whose every key is undefined', { name: undefined, notes: undefined }],
  ])('should be false for %s', (_what, patch) => {
    // GIVEN: a patch with nothing for drizzle to write
    // WHEN: it is checked
    // THEN: it should report false — drizzle throws "No values to set" rather than no-opping
    expect(writesAnything(patch)).toBe(false);
  });

  it('should be true when any field has a value', () => {
    expect(writesAnything({ name: 'Flour', notes: undefined })).toBe(true);
  });

  it.each([
    ['null', { notes: null }],
    ['an empty string', { notes: '' }],
  ])('should count %s as a value', (_what, patch) => {
    // Clearing a field is a write.
    expect(writesAnything(patch)).toBe(true);
  });
});

describe('changedColumns', () => {
  const stored = {
    amount: 62.15,
    dateOfBirth: '2019-07-03',
    locationId: 3,
    name: 'Drill',
    nationalId: '1234567890',
    notes: null,
    paidBackAt: null,
  };

  it('should report a changed column with both of its values', () => {
    expect(changedColumns(stored, { name: 'Cordless drill' })).toStrictEqual([
      { field: 'name', from: 'Drill', to: 'Cordless drill' },
    ]);
  });

  it('should ignore a column the patch does not write', () => {
    // GIVEN: a patch naming one column and leaving the rest alone
    // WHEN: it is diffed
    // THEN: `undefined` should mean "don't touch", never "cleared" — the distinction the whole
    // PATCH model rests on
    expect(changedColumns(stored, { name: undefined, notes: 'Shelf 2' })).toStrictEqual([
      { field: 'notes', from: null, to: 'Shelf 2' },
    ]);
  });

  it('should report nothing when a save writes the values already stored', () => {
    // The case the no-op rule rests on: a form posts every field on every save, so this is what
    // opening a record and pressing Save looks like from here.
    expect(changedColumns(stored, { amount: 62.15, name: 'Drill', notes: null })).toStrictEqual([]);
  });

  it('should name a foreign key without quoting it', () => {
    // "Location 3 → 7" tells a member nothing; the id is not the thing.
    expect(changedColumns(stored, { locationId: 7 })).toStrictEqual([{ field: 'locationId' }]);
  });

  it('should name an identity number without quoting it', () => {
    // An ID is readable on the record itself. A feed is not the place to keep a permanent copy of
    // one, least of all the copy that was replaced.
    expect(changedColumns(stored, { nationalId: '9999999999' })).toStrictEqual([{ field: 'nationalId' }]);
  });

  it('should read a timestamp a toggle drives as a value rather than a shape', () => {
    // GIVEN: an expense being marked as paid back, which writes a Date into the column
    const paidBackAt = new Date('2026-08-13T09:00:00.000Z');

    // WHEN: the save is diffed
    const [change] = changedColumns(stored, { paidBackAt });

    // THEN: the moment should survive as text the feed can format, not as an object it can't
    expect(change).toStrictEqual({ field: 'paidBackAt', from: null, to: '2026-08-13T09:00:00.000Z' });
  });

  it('should report nothing when a save writes the same moment back', () => {
    // GIVEN: a stored timestamp, and a second Date object holding that same moment
    const paidBackAt = new Date('2026-08-13T09:00:00.000Z');

    // THEN: it should be one value, not two objects — `Object.is` alone would call every re-save of
    // an unchanged timestamp a change, with an identical `from` and `to`
    expect(changedColumns({ paidBackAt: new Date(paidBackAt) }, { paidBackAt })).toStrictEqual([]);
  });
});

describe('sameList', () => {
  it('should treat a list that says the same thing as unchanged', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it.each([
    ['a member is added', ['a'], ['a', 'b']],
    ['one is swapped out', ['a', 'b'], ['a', 'c']],
    ['the order moves', ['a', 'b'], ['b', 'a']],
  ])('should notice when %s', (_what, existing, incoming) => {
    // Order counts: these stand for replace-all lists whose position is stored, so moving a recipe
    // step is an edit even though the set is identical.
    expect(sameList(existing, incoming)).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('should recognise the SQLSTATE at the top level', () => {
    expect(isUniqueViolation(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(true);
  });

  it('should find the code under a drizzle wrapper that carries none of its own', () => {
    // GIVEN: the shape drizzle actually raises — a wrapper with the driver error on `cause`
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    });

    // WHEN: it is checked
    // THEN: it should be recognised — a top-level-only check answered false for every real duplicate
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('should keep walking past more than one wrapper', () => {
    expect(isUniqueViolation({ cause: { cause: { cause: { code: '23505' } } } })).toBe(true);
  });

  it.each([
    ['a foreign-key violation', { code: '23503' }],
    ['a not-null violation on the cause', { cause: { code: '23502' } }],
  ])('should be false for %s', (_what, error) => {
    // GIVEN: a real database error that is not a duplicate
    // WHEN: it is checked
    // THEN: it should report false, so it surfaces as a 500 rather than a misleading 409
    expect(isUniqueViolation(error)).toBe(false);
  });

  it('should be false for an error carrying no code anywhere', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ cause: { cause: new Error('boom') } })).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'duplicate key value violates unique constraint "x"'],
    ['a number', 23505],
  ])('should be false for %s', (_what, value) => {
    // Something thrown that isn't an object must not make the check itself throw.
    expect(isUniqueViolation(value)).toBe(false);
  });

  it('should not match a numeric code', () => {
    // The comparison is strict, and every driver reports SQLSTATE as a string.
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });
});
