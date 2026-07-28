import { type MealType } from '@homewise/server/recipes';

/** Human-readable labels for the recipe `mealType` enum. */
export const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  snack: 'Snack',
  drink: 'Drink',
  side: 'Side',
  baking: 'Baking',
};

/**
 * How a recipe's source reads in the metadata strip. Where a recipe came from is an attribution, not
 * a section of its own, so it has to fit on one line next to the meal type and times: a bare URL is
 * given as its hostname ("okusno.je"), since the path is unreadable at that size.
 *
 * Returns `null` when there is nothing to attribute.
 */
export function formatSource(sourceName: string | null, sourceUrl: string | null) {
  if (sourceName) {
    return sourceName;
  }

  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    // The server validates the URL, so this only trips on legacy or hand-edited data.
    return sourceUrl;
  }
}

/** "1 h 20 min" reads faster than "80 min" once you're past an hour. */
export function formatMinutes(minutes: number | null) {
  if (minutes === null || minutes === 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
