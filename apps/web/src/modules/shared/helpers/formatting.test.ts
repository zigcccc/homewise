import { describe, expect, it } from 'vitest';

import { formatAmount, formatMinutes, formatSource, parseAmount } from './formatting';

describe('parseAmount', () => {
  it.each(['87.4', '0', '12'])('should read %s as a plain number', (input) => {
    expect(parseAmount(input)).toBe(Number(input));
  });

  it('should accept the decimal comma the display format uses', () => {
    // Typing back what you were shown has to work: `formatAmount` renders "87,40 €".
    expect(parseAmount('87,40')).toBe(87.4);
    expect(parseAmount('1,5')).toBe(1.5);
  });

  it('should trim surrounding whitespace', () => {
    expect(parseAmount('  12.50  ')).toBe(12.5);
  });

  it('should accept a bare leading or trailing point', () => {
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('5.')).toBe(5);
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['letters', 'abc'],
    ['a currency symbol', '12 €'],
    ['a thousands separator', '1.000,50'],
    ['a negative', '-5'],
    ['two points', '1.2.3'],
  ])('should return null for %s', (_what, input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('should never return NaN', () => {
    // The point of `null`: NaN would flow silently into a form value and a request body.
    for (const input of ['', 'abc', '1.2.3', '-']) {
      expect(parseAmount(input)).not.toBeNaN();
    }
  });
});

describe('formatAmount', () => {
  it('should render money in a fixed locale, so two members read the same string', () => {
    // Intl separates the amount and the symbol with U+00A0. Escaped rather than pasted, so an editor
    // normalising whitespace can't quietly turn this assertion into a no-op.
    expect(formatAmount(87.4, 'EUR')).toBe('87,40\u00A0\u20AC');
  });

  it('should always show two decimals', () => {
    expect(formatAmount(12, 'EUR')).toMatch(/12,00/);
  });

  it('should use the currency it is given rather than a global one', () => {
    // A household can change what it counts in, and past expenses keep what they were recorded as.
    expect(formatAmount(12, 'USD')).not.toBe(formatAmount(12, 'EUR'));
  });
});

describe('formatMinutes', () => {
  it.each([
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 h'],
    [80, '1 h 20 min'],
    [120, '2 h'],
    [125, '2 h 5 min'],
  ])('should render %i minutes as "%s"', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  it.each([
    ['no duration', null],
    ['zero', 0],
  ])('should return null for %s', (_what, minutes) => {
    expect(formatMinutes(minutes)).toBeNull();
  });
});

describe('formatSource', () => {
  it('should prefer the given name', () => {
    expect(formatSource('Grandma’s notebook', 'https://example.com/recipe')).toBe('Grandma’s notebook');
  });

  it('should fall back to the hostname, without www', () => {
    // A full path is unreadable next to other metadata.
    expect(formatSource(null, 'https://www.okusno.je/recept/potica')).toBe('okusno.je');
    expect(formatSource(null, 'https://okusno.je/recept/potica')).toBe('okusno.je');
  });

  it('should strip only a leading www', () => {
    expect(formatSource(null, 'https://www.wwf.org/x')).toBe('wwf.org');
  });

  it('should return the raw value when the URL will not parse', () => {
    // Only reachable through legacy or hand-edited data, but showing the raw string beats throwing
    // inside a table cell.
    expect(formatSource(null, 'not a url')).toBe('not a url');
  });

  it('should return null when there is nothing to attribute', () => {
    expect(formatSource(null, null)).toBeNull();
    expect(formatSource('', null)).toBeNull();
  });
});
