import { describe, expect, it } from 'vitest';

import { formatAmount, formatMinutes, formatSource, parseAmount } from './formatting';

describe('parseAmount', () => {
  it('reads a plain number', () => {
    expect(parseAmount('87.4')).toBe(87.4);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('12')).toBe(12);
  });

  it('accepts the decimal comma the display format uses', () => {
    // Typing back what you were shown has to work: `formatAmount` renders "87,40 €".
    expect(parseAmount('87,40')).toBe(87.4);
    expect(parseAmount('1,5')).toBe(1.5);
  });

  it('trims', () => {
    expect(parseAmount('  12.50  ')).toBe(12.5);
  });

  it('accepts a bare leading or trailing point', () => {
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
  ])('returns null for %s', (_what, input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('never returns NaN', () => {
    // The point of `null`: `NaN` would flow silently into a form value and a request body.
    for (const input of ['', 'abc', '1.2.3', '-']) {
      expect(parseAmount(input)).not.toBeNaN();
    }
  });
});

describe('formatAmount', () => {
  it('renders money in a fixed locale, so two members read the same string', () => {
    // Non-breaking spaces, hence the normalisation — what matters is the comma and the trailing symbol.
    expect(formatAmount(87.4, 'EUR').replace(/ /g, ' ')).toBe('87,40 €');
  });

  it('always shows two decimals', () => {
    expect(formatAmount(12, 'EUR')).toMatch(/12,00/);
  });

  it('uses the currency it is given, not a global one', () => {
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
  ])('renders %i minutes as "%s"', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  it('returns null when there is no duration to show', () => {
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
  });
});

describe('formatSource', () => {
  it('prefers the given name', () => {
    expect(formatSource('Grandma’s notebook', 'https://example.com/recipe')).toBe('Grandma’s notebook');
  });

  it('falls back to the hostname, without www', () => {
    expect(formatSource(null, 'https://www.okusno.je/recept/potica')).toBe('okusno.je');
    expect(formatSource(null, 'https://okusno.je/recept/potica')).toBe('okusno.je');
  });

  it('strips only a leading www', () => {
    expect(formatSource(null, 'https://www.wwf.org/x')).toBe('wwf.org');
  });

  it('returns the raw value when the URL will not parse', () => {
    // Only reachable through legacy or hand-edited data, since the server validates the URL — but
    // showing the raw string beats throwing inside a table cell.
    expect(formatSource(null, 'not a url')).toBe('not a url');
  });

  it('returns null when there is nothing to attribute', () => {
    expect(formatSource(null, null)).toBeNull();
    expect(formatSource('', null)).toBeNull();
  });
});
