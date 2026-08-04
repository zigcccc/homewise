import { type MeasurementUnit } from './models';

/**
 * A quantity as a shopping list carries one: a number, or `null` for "however much".
 */
export type Amount = { quantity: number | null; unit: MeasurementUnit | null };

/**
 * The units that convert into one another, and what one of each is worth in the family's base unit.
 *
 * Deliberately only the metric mass and volume pairs. `tsp`/`tbsp`/`cup` are volumes too and could
 * be converted on paper, but "1 tsp salt" rewritten as "5 ml salt" is a worse thing to read in a
 * shop — and `piece`, `pack`, `bunch` and the rest aren't measures of anything convertible at all.
 */
const FAMILIES: Partial<Record<MeasurementUnit, { base: MeasurementUnit; factor: number }>> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
};

/** What a base unit is called once the total is big enough to read better in the larger one. */
const PROMOTIONS: Partial<Record<MeasurementUnit, { factor: number; unit: MeasurementUnit }>> = {
  g: { factor: 1000, unit: 'kg' },
  ml: { factor: 1000, unit: 'l' },
};

/**
 * Adds up the same ingredient across several recipes.
 *
 * Returns one amount per group that can't be added to another, in the order first encountered — so
 * "200 g" and "1 cup" of the same flour come back as two amounts rather than being silently merged
 * or silently dropped. Within a convertible family everything is summed in the base unit and then
 * promoted if it reads better: 500 g + 1 kg is `1.5 kg`, not `1500 g`.
 *
 * Lines with no quantity ("salt, to taste") collapse into a single quantity-less amount: they say
 * "you need some of this", and three of them say nothing more than one.
 */
export function sumAmounts(amounts: Amount[]): Amount[] {
  // Keyed by what can be added together: the family's base unit, the literal unit for everything
  // else, and one bucket for the quantity-less lines. A Map, so the order of the first sighting
  // survives — the list should read in the order the recipes mentioned things.
  const totals = new Map<string, Amount>();

  for (const { quantity, unit } of amounts) {
    if (quantity === null) {
      totals.set('__none__', { quantity: null, unit: null });
      continue;
    }

    const family = unit ? FAMILIES[unit] : undefined;
    const key = family ? `family:${family.base}` : `unit:${unit ?? 'none'}`;
    const existing = totals.get(key);
    const value = family ? quantity * family.factor : quantity;

    if (existing?.quantity != null) {
      existing.quantity += value;
    } else {
      totals.set(key, { quantity: value, unit: family ? family.base : unit });
    }
  }

  return [...totals.values()].map((amount) => {
    const promotion = amount.unit ? PROMOTIONS[amount.unit] : undefined;

    if (!promotion || amount.quantity === null || amount.quantity < promotion.factor) {
      return round(amount);
    }

    return round({ quantity: amount.quantity / promotion.factor, unit: promotion.unit });
  });
}

/**
 * An amount for a fraction of what the recipe makes — half a batch, a batch and a half.
 *
 * A quantity-less line ("salt, to taste") is left exactly as it is: it says "you need some of this",
 * and there's no half of that. Nothing is rounded to a whole unit either, so a scaled `can` can come
 * out as `1.5` — deciding which units should round up is its own piece of work.
 */
export function scaleAmount({ quantity, unit }: Amount, factor: number): Amount {
  return round({ quantity: quantity === null ? null : quantity * factor, unit });
}

/** "200 g", "3" — for the amounts that have to be written into text rather than their own columns. */
export function formatAmount({ quantity, unit }: Amount) {
  if (quantity === null) {
    return unit ?? 'some';
  }

  return unit ? `${quantity} ${unit}` : String(quantity);
}

/** The column is `numeric(10,3)`; 1/3 of a litre shouldn't arrive as seventeen decimal places. */
function round({ quantity, unit }: Amount): Amount {
  return { quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000, unit };
}
