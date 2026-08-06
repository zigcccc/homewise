import { describe, expect, it } from 'vitest';

import { formatQuantity } from './labels';

describe('formatQuantity', () => {
  it('writes a quantity with its unit', () => {
    expect(formatQuantity(200, 'g')).toBe('200 g');
  });

  it('leaves "piece" implied', () => {
    // "3 eggs", not "3 pc eggs".
    expect(formatQuantity(3, 'piece')).toBe('3');
  });

  it('writes a bare number when there is no unit', () => {
    expect(formatQuantity(3, null)).toBe('3');
  });

  it('says "to taste" when there is neither a quantity nor a unit', () => {
    // A blank cell reads as missing data; this reads as the recipe.
    expect(formatQuantity(null, null)).toBe('to taste');
  });

  it('names the unit when there is no quantity', () => {
    expect(formatQuantity(null, 'pinch')).toBe('pinch');
  });

  it.each([
    [1.5, '1.5'],
    [2, '2'],
    [0.25, '0.25'],
    [1.25, '1.25'],
  ])('trims the numeric(10,3) trailing zeros from %s', (quantity, expected) => {
    expect(formatQuantity(quantity, null)).toBe(expected);
  });

  it('rounds past three decimals rather than printing them all', () => {
    // A scaled amount arrives as 0.3333333333333333; the column stores three decimals.
    expect(formatQuantity(1 / 3, 'l')).toBe('0.333 l');
  });

  it('handles a zero quantity as a number, not as absent', () => {
    expect(formatQuantity(0, 'g')).toBe('0 g');
  });
});
