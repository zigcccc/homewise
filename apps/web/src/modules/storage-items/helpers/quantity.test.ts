import { describe, expect, it } from 'vitest';

import { quantityText } from './quantity';

/**
 * The text an inline quantity cell accepts. Parsing with a clear input and a clear expected output,
 * and the one place the table's strings meet the endpoint's numbers — so what it rejects, and the
 * message it rejects it with, are worth pinning down.
 */

const message = (input: string) => quantityText.safeParse(input).error?.issues[0]?.message;

describe('quantityText', () => {
  it('should accept a whole number, surrounding space and all', () => {
    expect(quantityText.safeParse('4').success).toBe(true);
    expect(quantityText.parse(' 12 ')).toBe('12');
    expect(quantityText.safeParse('100000').success).toBe(true);
  });

  it('should reject anything that is not a whole number', () => {
    for (const input of ['', ' ', 'four', '1.5', '-2', '1e3', '3 crates']) {
      expect(quantityText.safeParse(input).success).toBe(false);
    }

    expect(message('1.5')).toBe('Quantity must be a whole number');
  });

  it('should reject a count outside the bounds, in the server’s own words', () => {
    // GIVEN: numbers the column itself refuses
    // THEN: the message should come from `storageItemQuantity` rather than a copy of its numbers
    expect(message('0')).toBe('Quantity must be at least 1');
    expect(message('100001')).toBe('Quantity must be at most 100000');
  });
});
