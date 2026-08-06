import { describe, expect, it } from 'vitest';

import { type Amount, formatAmount, scaleAmount, sumAmounts } from '#modules/ingredients/units';

const g = (quantity: number): Amount => ({ quantity, unit: 'g' });

describe('sumAmounts', () => {
  it('should add two amounts in the same unit', () => {
    expect(sumAmounts([g(200), g(300)])).toEqual([g(500)]);
  });

  it('should convert within a family before adding', () => {
    expect(sumAmounts([g(500), { quantity: 1, unit: 'kg' }])).toEqual([{ quantity: 1.5, unit: 'kg' }]);
    expect(
      sumAmounts([
        { quantity: 250, unit: 'ml' },
        { quantity: 1, unit: 'l' },
      ])
    ).toEqual([{ quantity: 1.25, unit: 'l' }]);
  });

  it('should promote only once the total is worth reading in the larger unit', () => {
    expect(sumAmounts([g(400), g(500)])).toEqual([g(900)]);
    expect(sumAmounts([g(500), g(500)])).toEqual([{ quantity: 1, unit: 'kg' }]);
  });

  it('should keep units that do not convert as separate amounts', () => {
    // 200 g and 1 cup of the same flour — merging or dropping either would be a lie.
    expect(sumAmounts([g(200), { quantity: 1, unit: 'cup' }])).toEqual([g(200), { quantity: 1, unit: 'cup' }]);
  });

  it('should keep mass and volume apart', () => {
    expect(sumAmounts([g(200), { quantity: 200, unit: 'ml' }])).toEqual([g(200), { quantity: 200, unit: 'ml' }]);
  });

  it('should preserve the order things were first mentioned in', () => {
    // GIVEN: cups mentioned before grams, then cups again
    // WHEN: they are summed
    // THEN: cups should still come first, so the list reads in recipe order
    expect(sumAmounts([{ quantity: 1, unit: 'cup' }, g(200), { quantity: 2, unit: 'cup' }])).toEqual([
      { quantity: 3, unit: 'cup' },
      g(200),
    ]);
  });

  it('should collapse every quantity-less line into one', () => {
    // GIVEN: three "to taste" lines
    const toTaste: Amount = { quantity: null, unit: null };

    // WHEN: they are summed
    // THEN: one should come back — three of them say nothing more than one does
    expect(sumAmounts([toTaste, toTaste, toTaste])).toEqual([toTaste]);
  });

  it('should keep a quantity-less line alongside a measured one', () => {
    expect(sumAmounts([{ quantity: null, unit: null }, g(200)])).toEqual([{ quantity: null, unit: null }, g(200)]);
  });

  it('should add unit-less quantities together', () => {
    expect(
      sumAmounts([
        { quantity: 2, unit: null },
        { quantity: 3, unit: null },
      ])
    ).toEqual([{ quantity: 5, unit: null }]);
  });

  it('should round to the three decimals the column stores', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(
      sumAmounts([
        { quantity: 0.1, unit: 'cup' },
        { quantity: 0.2, unit: 'cup' },
      ])
    ).toEqual([{ quantity: 0.3, unit: 'cup' }]);
  });

  it('should return nothing for nothing', () => {
    expect(sumAmounts([])).toEqual([]);
  });
});

describe('scaleAmount', () => {
  it('should scale a quantity up and down', () => {
    expect(scaleAmount(g(200), 2)).toEqual(g(400));
    expect(scaleAmount(g(200), 0.5)).toEqual(g(100));
  });

  it('should leave a quantity-less line exactly as it is', () => {
    // There is no half of "salt, to taste".
    expect(scaleAmount({ quantity: null, unit: null }, 0.5)).toEqual({ quantity: null, unit: null });
    expect(scaleAmount({ quantity: null, unit: 'pinch' }, 3)).toEqual({ quantity: null, unit: 'pinch' });
  });

  it('should round to three decimals', () => {
    expect(scaleAmount({ quantity: 1, unit: 'l' }, 1 / 3)).toEqual({ quantity: 0.333, unit: 'l' });
  });

  it('should not round a countable up to a whole', () => {
    // Deliberate, and tracked separately: half a can is what half a recipe needs.
    expect(scaleAmount({ quantity: 3, unit: 'can' }, 0.5)).toEqual({ quantity: 1.5, unit: 'can' });
  });

  it('should not promote to a larger unit', () => {
    // Promotion is summing's job, even when the result passes a kilogram.
    expect(scaleAmount(g(600), 2)).toEqual(g(1200));
  });
});

describe('formatAmount', () => {
  it('should write a quantity with its unit', () => {
    expect(formatAmount(g(200))).toBe('200 g');
  });

  it('should write a bare quantity when there is no unit', () => {
    expect(formatAmount({ quantity: 3, unit: null })).toBe('3');
  });

  it('should fall back to the unit when there is no quantity', () => {
    expect(formatAmount({ quantity: null, unit: 'pinch' })).toBe('pinch');
  });

  it('should say "some" when there is neither', () => {
    expect(formatAmount({ quantity: null, unit: null })).toBe('some');
  });
});
