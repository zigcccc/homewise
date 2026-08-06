import { describe, expect, it } from 'vitest';

import { emptyToNull, isUniqueViolation, writesAnything } from '#db/utils';

describe('emptyToNull', () => {
  it('turns a cleared field into NULL', () => {
    expect(emptyToNull('')).toBeNull();
  });

  it('passes an explicit null through', () => {
    expect(emptyToNull(null)).toBeNull();
  });

  it('leaves an omitted field omitted', () => {
    // Distinct from `''`: "don't touch this column", not "clear it".
    expect(emptyToNull(undefined)).toBeUndefined();
  });

  it('leaves real text alone, whitespace included', () => {
    expect(emptyToNull('notes')).toBe('notes');
    expect(emptyToNull(' ')).toBe(' ');
  });
});

describe('writesAnything', () => {
  it('is false for a PATCH that named no fields', () => {
    // `PATCH {}` reaches the update with every key undefined, and drizzle throws rather than no-opping.
    expect(writesAnything({})).toBe(false);
    expect(writesAnything({ name: undefined, notes: undefined })).toBe(false);
  });

  it('is true when any field has a value', () => {
    expect(writesAnything({ name: 'Flour', notes: undefined })).toBe(true);
  });

  it('counts null and empty string as values', () => {
    expect(writesAnything({ notes: null })).toBe(true);
    expect(writesAnything({ notes: '' })).toBe(true);
  });
});

describe('isUniqueViolation', () => {
  it('recognises the SQLSTATE at the top level', () => {
    expect(isUniqueViolation(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(true);
  });

  it('finds it under a drizzle wrapper that carries no code of its own', () => {
    // The shape that made this return false for every real duplicate: DrizzleQueryError wraps the
    // driver error and has no `code`, so a top-level-only check never saw one.
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    });

    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('keeps walking past more than one wrapper', () => {
    const deep = { cause: { cause: { cause: { code: '23505' } } } };

    expect(isUniqueViolation(deep)).toBe(true);
  });

  it('is false for a different SQLSTATE', () => {
    // 23503 is a foreign-key violation — a real error, but not a duplicate, and it must not answer 409.
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({ cause: { code: '23502' } })).toBe(false);
  });

  it('is false for an error carrying no code anywhere', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ cause: { cause: new Error('boom') } })).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'duplicate key value violates unique constraint "x"'],
    ['a number', 23505],
  ])('is false for %s', (_what, value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });

  it('does not match a numeric code', () => {
    // The comparison is strict, and every driver reports SQLSTATE as a string.
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });
});
