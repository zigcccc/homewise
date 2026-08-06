import { describe, expect, it } from 'vitest';

import { emptyToNull, isUniqueViolation, writesAnything } from '#db/utils';

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
