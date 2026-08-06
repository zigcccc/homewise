import { describe, expect, it } from 'vitest';

import { avatarFile, clearableDate, moneyAmount, optionalText, searchQueryParam } from '#lib/models';

const amount = moneyAmount('Amount');

describe('moneyAmount', () => {
  it.each([1, 0.01, 8.29, 1.1, 1234.56, 9_999_999_999.99])('should accept %s', (value) => {
    expect(amount.safeParse(value).success).toBe(true);
  });

  it('should accept a price a naive modulo check would refuse', () => {
    // GIVEN: 8.29, which is not an exact binary fraction
    expect(8.29 % 0.01).not.toBe(0);

    // WHEN: it is parsed
    // THEN: it should be accepted — a hand-rolled `value % 0.01` refuses ordinary prices, which is
    // why the rule is expressed with `toFixed`
    expect(amount.safeParse(8.29).success).toBe(true);
    expect(amount.safeParse(0.29).success).toBe(true);
  });

  it.each([1.005, 0.001, 1.234])('should refuse %s rather than rounding it', (value) => {
    // WHEN: an amount with more than two decimals is parsed
    const result = amount.safeParse(value);

    // THEN: it should be refused — the numeric(12,2) column would silently round it otherwise
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Amount can have at most 2 decimal places');
  });

  it.each([0, -1, -0.5])('should refuse %s', (value) => {
    expect(amount.safeParse(value).success).toBe(false);
  });

  it('should refuse an amount over the column ceiling', () => {
    expect(amount.safeParse(10_000_000_000).success).toBe(false);
  });

  it('should name the field in its messages', () => {
    expect(moneyAmount('Total').safeParse(-1).error?.issues[0]?.message).toBe('Total must be more than 0');
    expect(moneyAmount('Total').safeParse('5').error?.issues[0]?.message).toBe('Total must be a number');
  });
});

describe('optionalText', () => {
  const notes = optionalText(10, 'Notes');

  it('should accept an empty string as "cleared"', () => {
    // The service turns this into NULL; the API's "cleared" is '' and the column's is NULL.
    expect(notes.parse('')).toBe('');
  });

  it('should leave the key omittable', () => {
    // Distinct from '': "don't touch this column", not "clear it".
    expect(notes.parse(undefined)).toBeUndefined();
  });

  it('should trim surrounding whitespace', () => {
    expect(notes.parse('  hi  ')).toBe('hi');
  });

  it('should measure the length after trimming', () => {
    expect(notes.parse('  abcdefghij  ')).toBe('abcdefghij');
  });

  it('should refuse an over-long value with a message naming the field', () => {
    expect(notes.safeParse('abcdefghijk').error?.issues[0]?.message).toBe('Notes must contain at most 10 characters');
  });
});

describe('searchQueryParam', () => {
  it('should turn a blank query into no filter', () => {
    expect(searchQueryParam.parse('')).toBeUndefined();
    expect(searchQueryParam.parse('   ')).toBeUndefined();
  });

  it('should trim a real query', () => {
    expect(searchQueryParam.parse('  milk ')).toBe('milk');
  });

  it.each([
    ['a repeated param, which arrives as an array', ['milk', 'eggs']],
    ['a non-string', 42],
  ])('should degrade to no filter for %s', (_what, value) => {
    // GIVEN: a malformed query string
    // WHEN: it is parsed
    // THEN: it should fall back to no filter, so the page renders unfiltered instead of 400ing
    expect(searchQueryParam.parse(value)).toBeUndefined();
  });
});

describe('clearableDate', () => {
  it('should accept an ISO day and an empty string', () => {
    expect(clearableDate.parse('2026-08-06')).toBe('2026-08-06');
    expect(clearableDate.parse('')).toBe('');
  });

  it.each(['2026-13-45', '06. 08. 2026', 'nope', '2026-02-31'])('should refuse %s', (value) => {
    // Including impossible dates — the bare z.string() drizzle-zod generates would take all of these.
    expect(clearableDate.safeParse(value).success).toBe(false);
  });
});

describe('avatarFile', () => {
  const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' });

  it('should accept a safe <slug>.<ext> name', () => {
    expect(avatarFile.safeParse(png('bear-cub.png')).success).toBe(true);
  });

  it.each([
    ['a slash, which would escape the avatars/ prefix', '../secrets/key.png'],
    ['a second dot', 'bear.cub.png'],
    ['an uppercase letter', 'Bear.png'],
    ['a space', 'bear cub.png'],
    ['no extension', 'bear'],
  ])('should refuse a name with %s', (_why, name) => {
    // GIVEN: a filename that is not a safe path segment
    // WHEN: it is parsed
    // THEN: it should be refused — the filename is the dedup key and lands in a blob path
    expect(avatarFile.safeParse(png(name)).success).toBe(false);
  });

  it('should refuse a file over 1MB', () => {
    expect(avatarFile.safeParse(png('bear.png', 1024 * 1024 + 1)).error?.issues[0]?.message).toBe(
      'Avatar must be under 1MB'
    );
  });

  it('should refuse a non-image', () => {
    const pdf = new File([new Uint8Array(10)], 'bear.pdf', { type: 'application/pdf' });

    expect(avatarFile.safeParse(pdf).error?.issues[0]?.message).toBe('Avatar must be an image');
  });

  it('should leave the key omittable', () => {
    expect(avatarFile.parse(undefined)).toBeUndefined();
  });
});
