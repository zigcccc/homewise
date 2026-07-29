import { type RecipeDetail } from '../recipes.queries';

type RecipeIngredientGroup = { section: string | null; lines: RecipeDetail['ingredients'] };

/**
 * Groups a recipe's ingredient lines under their section heading ("For the dough"), preserving the
 * saved order.
 *
 * Only *adjacent* lines merge, so a list that returns to an earlier section legitimately yields two
 * groups with the same name — the cook's ordering is the source of truth, not the section name.
 */
export function groupBySection(ingredients: RecipeDetail['ingredients']): RecipeIngredientGroup[] {
  const groups: RecipeIngredientGroup[] = [];

  for (const line of ingredients) {
    const last = groups.at(-1);

    if (last && last.section === line.section) {
      last.lines.push(line);
    } else {
      groups.push({ section: line.section, lines: [line] });
    }
  }

  return groups;
}
