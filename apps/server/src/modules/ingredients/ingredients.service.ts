import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { type CreateIngredient, type ListIngredientsQueryParams, type PatchIngredient } from './models';

/** A `db` handle or an open transaction — lets `create` run inside a caller's transaction (e.g. save-recipe). */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

/**
 * The household's reusable ingredient vocabulary. Recipes reference these rows; shopping lists and
 * meal plans will too, which is why names are deduplicated case-insensitively.
 */
export class IngredientsService {
  /** Resolves an ingredient, scoped to its household so ids from elsewhere 404. */
  private static async readIngredientRow(householdId: number, ingredientId: number, executor: Executor = db) {
    const ingredient = await executor.query.ingredient.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, ingredientId)),
    });

    if (!ingredient) {
      throw new HTTPException(404, { message: 'Ingredient not found' });
    }

    return ingredient;
  }

  /**
   * How many recipe lines reference each of the given ingredients. Constrained to the ids just read
   * rather than grouping the whole table.
   */
  private static async countRecipeUsage(ingredientIds: number[]) {
    if (ingredientIds.length === 0) {
      return new Map<number, number>();
    }

    const rows = await db
      .select({ ingredientId: schema.recipeIngredient.ingredientId, count: count() })
      .from(schema.recipeIngredient)
      .where(inArray(schema.recipeIngredient.ingredientId, ingredientIds))
      .groupBy(schema.recipeIngredient.ingredientId);

    return new Map(rows.map((row) => [row.ingredientId, row.count]));
  }

  /**
   * Rejects a name that already exists in the household, case-insensitively. The unique index is the
   * real guarantee — this exists so the user gets a 409 with a message instead of a constraint error.
   */
  private static async assertNameAvailable(
    householdId: number,
    name: string,
    executor: Executor = db,
    excludeId?: number
  ) {
    const filters = [
      eq(schema.ingredient.householdId, householdId),
      sql`lower(${schema.ingredient.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
      filters.push(ne(schema.ingredient.id, excludeId));
    }

    const [existing] = await executor
      .select({ id: schema.ingredient.id })
      .from(schema.ingredient)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw new HTTPException(409, { message: `"${name}" is already in your ingredient library` });
    }
  }

  /** The household's ingredient library, with how many recipes each one is used in. */
  public static async list(
    householdId: number,
    { search, category, sortKey, sortDirection }: ListIngredientsQueryParams
  ) {
    const { householdId: householdIdColumn, name, notes, category: categoryColumn } = schema.ingredient;
    const sortColumn = schema.ingredient[sortKey];

    const filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(name, term), ilike(notes, term))!);
    }

    if (category) {
      filters.push(eq(categoryColumn, category));
    }

    const ingredients = await db.query.ingredient.findMany({
      where: and(...filters),
      orderBy: sortDirection === 'desc' ? [desc(sortColumn)] : [asc(sortColumn)],
    });

    const usage = await IngredientsService.countRecipeUsage(ingredients.map((row) => row.id));

    return ingredients.map((row) => ({ ...row, recipeCount: usage.get(row.id) ?? 0 }));
  }

  /** Creates an ingredient. Accepts an `executor` so a recipe save can create one atomically. */
  public static async create(householdId: number, data: CreateIngredient, executor: Executor = db) {
    await IngredientsService.assertNameAvailable(householdId, data.name, executor);

    const [created] = await executor
      .insert(schema.ingredient)
      .values({
        householdId,
        name: data.name,
        category: data.category,
        defaultUnit: data.defaultUnit ?? null,
        notes: emptyToNull(data.notes),
      })
      .returning();

    if (!created) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return { ...created, recipeCount: 0 };
  }

  public static async patch(householdId: number, ingredientId: number, data: PatchIngredient) {
    await IngredientsService.readIngredientRow(householdId, ingredientId);

    if (data.name !== undefined) {
      await IngredientsService.assertNameAvailable(householdId, data.name, db, ingredientId);
    }

    const [updated] = await db
      .update(schema.ingredient)
      .set({
        name: data.name,
        category: data.category,
        // `null` clears the unit; `undefined` leaves it alone.
        defaultUnit: data.defaultUnit,
        notes: emptyToNull(data.notes),
      })
      .where(and(eq(schema.ingredient.householdId, householdId), eq(schema.ingredient.id, ingredientId)))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: 'Ingredient not found' });
    }

    const usage = await IngredientsService.countRecipeUsage([ingredientId]);

    return { ...updated, recipeCount: usage.get(ingredientId) ?? 0 };
  }

  /**
   * Hard delete, blocked while any recipe still uses it — deleting "flour" must not silently gut
   * every recipe that references it. The FK is `restrict`, so this check is the friendly message,
   * not the guarantee.
   */
  public static async delete(householdId: number, ingredientId: number) {
    await IngredientsService.readIngredientRow(householdId, ingredientId);

    const usage = await IngredientsService.countRecipeUsage([ingredientId]);
    const recipeCount = usage.get(ingredientId) ?? 0;

    if (recipeCount > 0) {
      throw new HTTPException(409, {
        message: `This ingredient is used in ${recipeCount} recipe${recipeCount === 1 ? '' : 's'}. Remove it from them first.`,
      });
    }

    const [deleted] = await db
      .delete(schema.ingredient)
      .where(and(eq(schema.ingredient.householdId, householdId), eq(schema.ingredient.id, ingredientId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Ingredient not found' });
    }

    return deleted;
  }
}
