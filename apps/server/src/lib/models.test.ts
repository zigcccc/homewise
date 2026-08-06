import { describe, expect, it } from 'vitest';

import { avatarFile, clearableDate, moneyAmount, optionalText, searchQueryParam } from '#lib/models';

const amount = moneyAmount('Amount');

describe('moneyAmount', () => {
  it.each([1, 0.01, 8.29, 1.1, 1234.56, 9_999_999_999.99])('accepts %s', (value) => {
    expect(amount.safeParse(value).success).toBe(true);
  });

  it('accepts a price a naive modulo check would refuse', () => {
    // 8.29 and 0.29 are not exact binary fractions, so `8.29 % 0.01` is not 0. Whatever the rule is
    // implemented with, an ordinary price has to get through — that is what this pins.
    expect(8.29 % 0.01).not.toBe(0);
    expect(amount.safeParse(8.29).success).toBe(true);
    expect(amount.safeParse(0.29).success).toBe(true);
  });

  it.each([1.005, 0.001, 1.234])('refuses %s rather than rounding it', (value) => {
    const result = amount.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Amount can have at most 2 decimal places');
  });

  it.each([0, -1, -0.5])('refuses %s', (value) => {
    expect(amount.safeParse(value).success).toBe(false);
  });

  it('refuses an amount over the numeric(12,2) ceiling', () => {
    expect(amount.safeParse(10_000_000_000).success).toBe(false);
  });

  it('names the field in its messages', () => {
    expect(moneyAmount('Total').safeParse(-1).error?.issues[0]?.message).toBe('Total must be more than 0');
    expect(moneyAmount('Total').safeParse('5').error?.issues[0]?.message).toBe('Total must be a number');
  });
});

describe('optionalText', () => {
  const notes = optionalText(10, 'Notes');

  it('accepts an empty string as "cleared"', () => {
    expect(notes.parse('')).toBe('');
  });

  it('leaves the key omittable', () => {
    expect(notes.parse(undefined)).toBeUndefined();
  });

  it('trims', () => {
    expect(notes.parse('  hi  ')).toBe('hi');
  });

  it('measures the length after trimming', () => {
    expect(notes.parse('  abcdefghij  ')).toBe('abcdefghij');
  });

  it('refuses an over-long value with a message naming the field', () => {
    expect(notes.safeParse('abcdefghijk').error?.issues[0]?.message).toBe('Notes must contain at most 10 characters');
  });
});

describe('searchQueryParam', () => {
  it('turns a blank query into no filter', () => {
    expect(searchQueryParam.parse('')).toBeUndefined();
    expect(searchQueryParam.parse('   ')).toBeUndefined();
  });

  it('trims a real query', () => {
    expect(searchQueryParam.parse('  milk ')).toBe('milk');
  });

  it('degrades to no filter instead of throwing on a malformed value', () => {
    // What `.catch(undefined)` buys: a hand-edited link renders the unfiltered list rather than 400ing.
    expect(searchQueryParam.parse(['milk', 'eggs'])).toBeUndefined();
    expect(searchQueryParam.parse(42)).toBeUndefined();
  });
});

describe('clearableDate', () => {
  it('accepts an ISO day and an empty string', () => {
    expect(clearableDate.parse('2026-08-06')).toBe('2026-08-06');
    expect(clearableDate.parse('')).toBe('');
  });

  it.each(['2026-13-45', '06. 08. 2026', 'nope', '2026-02-31'])('refuses %s', (value) => {
    expect(clearableDate.safeParse(value).success).toBe(false);
  });
});

describe('avatarFile', () => {
  const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' });

  it('accepts a safe <slug>.<ext> name', () => {
    expect(avatarFile.safeParse(png('bear-cub.png')).success).toBe(true);
  });

  it.each([
    ['a slash, which would escape the avatars/ prefix', '../secrets/key.png'],
    ['a second dot', 'bear.cub.png'],
    ['an uppercase letter', 'Bear.png'],
    ['a space', 'bear cub.png'],
    ['no extension', 'bear'],
  ])('refuses a name with %s', (_why, name) => {
    expect(avatarFile.safeParse(png(name)).success).toBe(false);
  });

  it('refuses a file over 1MB', () => {
    expect(avatarFile.safeParse(png('bear.png', 1024 * 1024 + 1)).error?.issues[0]?.message).toBe(
      'Avatar must be under 1MB'
    );
  });

  it('refuses a non-image', () => {
    const pdf = new File([new Uint8Array(10)], 'bear.pdf', { type: 'application/pdf' });

    expect(avatarFile.safeParse(pdf).error?.issues[0]?.message).toBe('Avatar must be an image');
  });

  it('leaves the key omittable', () => {
    expect(avatarFile.parse(undefined)).toBeUndefined();
  });
});
