import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import {
  type CreateRecipe,
  type ListRecipesQueryParams,
  type PatchRecipe,
  type RecipeIngredient,
  type RecipeStep,
} from './models';

/** A `db` handle or an open transaction. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

const creatorWith = { columns: { id: true, name: true, image: true } } as const;

/** Tag links are a join-table detail — the API exposes a flat `tags` array instead. */
const flattenTags = <T extends { tagLinks: { tag: { id: number; name: string } }[] }>({ tagLinks, ...rest }: T) => ({
  ...rest,
  tags: tagLinks.map((link) => link.tag).sort((a, b) => a.name.localeCompare(b.name)),
});

/** Household recipes. Fully collaborative — any member can add, edit and delete. */
export class RecipesService {
  /** Resolves a recipe, scoped to its household so ids from elsewhere 404. */
  private static async readRecipeRow(householdId: number, recipeId: number, executor: Executor = db) {
    const recipe = await executor.query.recipe.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, recipeId)),
    });

    if (!recipe) {
      throw new HTTPException(404, { message: 'Recipe not found' });
    }

    return recipe;
  }

  /** Re-reads a recipe with everything nested, so every mutation returns the shape a read produces. */
  private static async readRecipeWithRelations(householdId: number, recipeId: number, executor: Executor = db) {
    const recipe = await executor.query.recipe.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, recipeId)),
      with: {
        creator: creatorWith,
        ingredients: {
          orderBy: (fields, { asc }) => [asc(fields.position)],
          with: { ingredient: true },
        },
        steps: { orderBy: (fields, { asc }) => [asc(fields.position)] },
        tagLinks: { with: { tag: true } },
      },
    });

    if (!recipe) {
      throw new HTTPException(404, { message: 'Recipe not found' });
    }

    return flattenTags(recipe);
  }

  /**
   * Rejects ingredient ids that don't belong to this household — without this a caller could
   * reference another household's ingredient rows through their own recipe.
   */
  private static async assertIngredientsInHousehold(
    executor: Executor,
    householdId: number,
    lines: RecipeIngredient[]
  ) {
    const ids = [...new Set(lines.map((line) => line.ingredientId))];

    if (ids.length === 0) {
      return;
    }

    const found = await executor
      .select({ id: schema.ingredient.id })
      .from(schema.ingredient)
      .where(and(eq(schema.ingredient.householdId, householdId), inArray(schema.ingredient.id, ids)));

    if (found.length !== ids.length) {
      throw new HTTPException(404, { message: 'Ingredient not found' });
    }
  }

  /**
   * Maps tag names onto household tag rows, creating the ones that don't exist yet. Matching is
   * case-insensitive, so "Quick" and "quick" resolve to the same tag.
   */
  private static async resolveTagIds(executor: Executor, householdId: number, names: string[]) {
    // Dedupe case-insensitively, keeping the first spelling the user typed.
    const wanted = new Map<string, string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (!wanted.has(key)) {
        wanted.set(key, name);
      }
    }

    if (wanted.size === 0) {
      return [];
    }

    // A household's tag vocabulary is small, so reading it whole beats a lower() IN (…) round trip.
    const readTags = async () =>
      executor
        .select({ id: schema.recipeTag.id, name: schema.recipeTag.name })
        .from(schema.recipeTag)
        .where(eq(schema.recipeTag.householdId, householdId));

    const existing = await readTags();
    const byLower = new Map(existing.map((tag) => [tag.name.toLowerCase(), tag.id]));
    const missing = [...wanted].filter(([key]) => !byLower.has(key)).map(([, name]) => ({ householdId, name }));

    if (missing.length === 0) {
      return [...wanted.keys()].map((key) => byLower.get(key)!);
    }

    // onConflictDoNothing covers a concurrent save creating the same tag; the re-read picks it up.
    await executor.insert(schema.recipeTag).values(missing).onConflictDoNothing();

    const refreshed = await readTags();
    const refreshedByLower = new Map(refreshed.map((tag) => [tag.name.toLowerCase(), tag.id]));

    // Every wanted key must resolve now: it either existed or was just inserted. If one doesn't,
    // something is wrong with the insert — fail rather than quietly saving the recipe minus a tag.
    return [...wanted.keys()].map((key) => {
      const id = refreshedByLower.get(key);

      if (id === undefined) {
        throw new HTTPException(500, { message: `Could not resolve tag "${wanted.get(key)}"` });
      }

      return id;
    });
  }

  /** Replace-all: the submitted list becomes the recipe's full ingredient list, in array order. */
  private static async replaceIngredients(executor: Executor, recipeId: number, lines: RecipeIngredient[]) {
    await executor.delete(schema.recipeIngredient).where(eq(schema.recipeIngredient.recipeId, recipeId));

    if (lines.length === 0) {
      return;
    }

    await executor.insert(schema.recipeIngredient).values(
      lines.map((line, index) => ({
        recipeId,
        ingredientId: line.ingredientId,
        quantity: line.quantity ?? null,
        unit: line.unit ?? null,
        note: emptyToNull(line.note) ?? null,
        section: emptyToNull(line.section) ?? null,
        position: index,
      }))
    );
  }

  /** Replace-all, same as ingredients — `position` comes from the array order. */
  private static async replaceSteps(executor: Executor, recipeId: number, steps: RecipeStep[]) {
    await executor.delete(schema.recipeStep).where(eq(schema.recipeStep.recipeId, recipeId));

    if (steps.length === 0) {
      return;
    }

    await executor
      .insert(schema.recipeStep)
      .values(steps.map((step, index) => ({ recipeId, position: index, instruction: step.instruction })));
  }

  private static async replaceTags(executor: Executor, householdId: number, recipeId: number, names: string[]) {
    const tagIds = await RecipesService.resolveTagIds(executor, householdId, names);

    await executor.delete(schema.recipeTagLink).where(eq(schema.recipeTagLink.recipeId, recipeId));

    if (tagIds.length === 0) {
      return;
    }

    await executor
      .insert(schema.recipeTagLink)
      .values(tagIds.map((tagId) => ({ recipeId, tagId })))
      .onConflictDoNothing();
  }

  /**
   * The recipe list: metadata plus counts, never the nested ingredients/steps — filtering the list
   * must not drag every recipe's full body across the wire.
   */
  public static async list(
    householdId: number,
    { search, mealType, tagId, favoritesOnly, includeArchived, sortKey, sortDirection }: ListRecipesQueryParams
  ) {
    const { archived, cuisine, description, householdId: householdIdColumn, isFavorite, title } = schema.recipe;
    const sortColumn = schema.recipe[sortKey];

    const filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;

      // Searching an ingredient name finds the recipes that use it — "what can I make with chickpeas?"
      const byIngredient = db
        .select({ recipeId: schema.recipeIngredient.recipeId })
        .from(schema.recipeIngredient)
        .innerJoin(schema.ingredient, eq(schema.recipeIngredient.ingredientId, schema.ingredient.id))
        .where(ilike(schema.ingredient.name, term));

      filters.push(
        or(ilike(title, term), ilike(description, term), ilike(cuisine, term), inArray(schema.recipe.id, byIngredient))!
      );
    }

    if (mealType) {
      filters.push(eq(schema.recipe.mealType, mealType));
    }

    if (tagId) {
      const tagged = db
        .select({ recipeId: schema.recipeTagLink.recipeId })
        .from(schema.recipeTagLink)
        .where(eq(schema.recipeTagLink.tagId, tagId));

      filters.push(inArray(schema.recipe.id, tagged));
    }

    if (favoritesOnly) {
      filters.push(eq(isFavorite, true));
    }

    if (!includeArchived) {
      filters.push(eq(archived, false));
    }

    const recipes = await db.query.recipe.findMany({
      where: and(...filters),
      orderBy: sortDirection === 'desc' ? [desc(sortColumn)] : [asc(sortColumn)],
      with: { creator: creatorWith, tagLinks: { with: { tag: true } } },
    });

    const recipeIds = recipes.map((row) => row.id);

    // Both counts are constrained to the ids just read, never grouped over the whole table.
    const [ingredientCounts, stepCounts] =
      recipeIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({ recipeId: schema.recipeIngredient.recipeId, count: count() })
              .from(schema.recipeIngredient)
              .where(inArray(schema.recipeIngredient.recipeId, recipeIds))
              .groupBy(schema.recipeIngredient.recipeId),
            db
              .select({ recipeId: schema.recipeStep.recipeId, count: count() })
              .from(schema.recipeStep)
              .where(inArray(schema.recipeStep.recipeId, recipeIds))
              .groupBy(schema.recipeStep.recipeId),
          ]);

    const ingredientCountByRecipe = new Map(ingredientCounts.map(({ recipeId, count }) => [recipeId, count]));
    const stepCountByRecipe = new Map(stepCounts.map(({ recipeId, count }) => [recipeId, count]));

    return recipes.map((row) => ({
      ...flattenTags(row),
      ingredientCount: ingredientCountByRecipe.get(row.id) ?? 0,
      stepCount: stepCountByRecipe.get(row.id) ?? 0,
    }));
  }

  public static async read(householdId: number, recipeId: number) {
    return RecipesService.readRecipeWithRelations(householdId, recipeId);
  }

  public static async create(householdId: number, data: CreateRecipe, userId: string) {
    const recipeId = await db.transaction(async (tx) => {
      await RecipesService.assertIngredientsInHousehold(tx, householdId, data.ingredients ?? []);

      const [created] = await tx
        .insert(schema.recipe)
        .values({
          householdId,
          title: data.title,
          description: emptyToNull(data.description),
          mealType: data.mealType ?? null,
          cuisine: emptyToNull(data.cuisine),
          servings: data.servings ?? null,
          prepTimeMinutes: data.prepTimeMinutes ?? null,
          cookTimeMinutes: data.cookTimeMinutes ?? null,
          sourceName: emptyToNull(data.sourceName),
          sourceUrl: emptyToNull(data.sourceUrl),
          createdBy: userId,
        })
        .returning();

      if (!created) {
        throw new HTTPException(400, { message: 'Something went wrong.' });
      }

      await RecipesService.replaceIngredients(tx, created.id, data.ingredients ?? []);
      await RecipesService.replaceSteps(tx, created.id, data.steps ?? []);
      await RecipesService.replaceTags(tx, householdId, created.id, data.tags ?? []);

      return created.id;
    });

    return RecipesService.readRecipeWithRelations(householdId, recipeId);
  }

  public static async patch(householdId: number, recipeId: number, data: PatchRecipe) {
    await RecipesService.readRecipeRow(householdId, recipeId);

    const set = {
      title: data.title,
      description: emptyToNull(data.description),
      mealType: data.mealType,
      cuisine: emptyToNull(data.cuisine),
      servings: data.servings,
      prepTimeMinutes: data.prepTimeMinutes,
      cookTimeMinutes: data.cookTimeMinutes,
      sourceName: emptyToNull(data.sourceName),
      sourceUrl: emptyToNull(data.sourceUrl),
      isFavorite: data.isFavorite,
      archived: data.archived,
    };

    await db.transaction(async (tx) => {
      if (data.ingredients !== undefined) {
        await RecipesService.assertIngredientsInHousehold(tx, householdId, data.ingredients);
      }

      // Skip the update when only children changed — an all-undefined `set` has nothing to write.
      if (Object.values(set).some((value) => value !== undefined)) {
        await tx
          .update(schema.recipe)
          .set(set)
          .where(and(eq(schema.recipe.householdId, householdId), eq(schema.recipe.id, recipeId)));
      }

      if (data.ingredients !== undefined) {
        await RecipesService.replaceIngredients(tx, recipeId, data.ingredients);
      }

      if (data.steps !== undefined) {
        await RecipesService.replaceSteps(tx, recipeId, data.steps);
      }

      if (data.tags !== undefined) {
        await RecipesService.replaceTags(tx, householdId, recipeId, data.tags);
      }
    });

    return RecipesService.readRecipeWithRelations(householdId, recipeId);
  }

  public static async delete(householdId: number, recipeId: number) {
    const [deleted] = await db
      .delete(schema.recipe)
      .where(and(eq(schema.recipe.householdId, householdId), eq(schema.recipe.id, recipeId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Recipe not found' });
    }

    return deleted;
  }

  /** The household's tag vocabulary, for the recipe form's picker and the list filter. */
  public static async listTags(householdId: number) {
    return db.query.recipeTag.findMany({
      where: (fields, { eq }) => eq(fields.householdId, householdId),
      orderBy: (fields, { asc }) => [asc(fields.name)],
    });
  }

  /** Removes a tag from the vocabulary. Its links cascade — a tag carries no data of its own. */
  public static async deleteTag(householdId: number, tagId: number) {
    const [deleted] = await db
      .delete(schema.recipeTag)
      .where(and(eq(schema.recipeTag.householdId, householdId), eq(schema.recipeTag.id, tagId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Tag not found' });
    }

    return deleted;
  }
}
