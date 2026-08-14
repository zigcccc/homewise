import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { changedColumns, type Executor, emptyToNull, type Filters, readPagedList, sameList } from '#db/utils';
import { couldNotResolve, notFound, somethingWentWrong } from '#lib/errors';
import { IngredientsService } from '#modules/ingredients/ingredients.service';
import { MealPlanService } from '#modules/meal-plan/meal-plan.service';

import {
  type CreateRecipe,
  type ListRecipesQueryParams,
  type PatchRecipe,
  type RecipeIngredient,
  type RecipeStep,
} from './recipes.model';

/** An ingredient line once its `ingredientName`, if any, has been turned into a real library id. */
type ResolvedRecipeIngredient = Omit<RecipeIngredient, 'ingredientId' | 'ingredientName'> & { ingredientId: number };

const creatorWith = { columns: { id: true, name: true, image: true } } as const;

/**
 * How a save's children compare against the stored ones. Replace-all lists, so position is part of
 * the key — moving a step *is* an edit — and normalized exactly as `replaceIngredients` writes them.
 */
/** Tags resolve by name into a set, so order, case and repeats are all noise rather than an edit. */
const tagKeys = (names: string[]) => [...new Set(names.map((name) => name.toLowerCase()))].sort();

const stepKey = (step: { instruction: string }) => step.instruction;

const lineKey = (line: {
  ingredientId: number;
  note?: string | null;
  quantity?: number | null;
  section?: string | null;
  unit?: string | null;
}) =>
  [
    line.ingredientId,
    line.quantity ?? '',
    line.unit ?? '',
    emptyToNull(line.note) ?? '',
    emptyToNull(line.section) ?? '',
  ].join('|');

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
      throw notFound('Recipe');
    }

    return recipe;
  }

  /** Re-reads a recipe with everything nested, so every mutation returns the shape a read produces. */
  private static async readRecipeWithRelations(householdId: number, recipeId: number) {
    const recipe = await db.query.recipe.findFirst({
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
      throw notFound('Recipe');
    }

    return flattenTags(recipe);
  }

  /**
   * Rejects ingredient ids that don't belong to this household — without this a caller could
   * reference another household's ingredient rows through their own recipe.
   *
   * Deduplicates its own input. The query returns distinct rows, so a repeated id makes `found`
   * shorter than `ids` and 404s something valid — a recipe listing the same ingredient twice is
   * ordinary. That used to depend on the one call site remembering to pass a `Set`.
   */
  private static async assertIngredientsInHousehold(executor: Executor, householdId: number, ids: number[]) {
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
      return;
    }

    const found = await executor
      .select({ id: schema.ingredient.id })
      .from(schema.ingredient)
      .where(and(eq(schema.ingredient.householdId, householdId), inArray(schema.ingredient.id, unique)));

    if (found.length !== unique.length) {
      throw notFound('Ingredient');
    }
  }

  /**
   * Turns every ingredient line into one carrying a concrete library id: existing ids are checked
   * for household membership, and names are found-or-created. Both run inside the caller's
   * transaction, so a recipe that fails to save leaves no new ingredients behind.
   */
  private static async resolveLineIngredients(
    executor: Executor,
    householdId: number,
    lines: RecipeIngredient[]
  ): Promise<ResolvedRecipeIngredient[]> {
    const ids = lines.map((line) => line.ingredientId).filter((id) => id !== undefined);
    // A named line carries the unit it's used with, which seeds the library row's default unit when
    // this is the save that creates it.
    const named = lines.flatMap((line) =>
      line.ingredientName === undefined ? [] : [{ defaultUnit: line.unit, name: line.ingredientName }]
    );

    await RecipesService.assertIngredientsInHousehold(executor, householdId, ids);
    const idByName = await IngredientsService.resolveByName(executor, householdId, named);

    return lines.map(({ ingredientId, ingredientName, ...rest }) => {
      const resolved = ingredientId ?? idByName.get(ingredientName!.toLowerCase());

      // The model refines that exactly one of the two is set, and `resolveByName` throws on anything
      // it can't resolve — so this is unreachable unless one of those guarantees breaks.
      if (resolved === undefined) {
        throw couldNotResolve('a recipe ingredient');
      }

      return { ...rest, ingredientId: resolved };
    });
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
        throw couldNotResolve(`tag "${wanted.get(key)}"`);
      }

      return id;
    });
  }

  /** Replace-all: the submitted list becomes the recipe's full ingredient list, in array order. */
  private static async replaceIngredients(executor: Executor, recipeId: number, lines: ResolvedRecipeIngredient[]) {
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
    {
      search,
      mealType,
      tagId,
      favoritesOnly,
      includeArchived,
      sortKey,
      sortDirection,
      page,
      pageSize,
    }: ListRecipesQueryParams
  ) {
    const { archived, cuisine, description, householdId: householdIdColumn, isFavorite, title } = schema.recipe;
    const sortColumn = schema.recipe[sortKey];

    const filters: Filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;

      // Searching an ingredient name finds the recipes that use it — "what can I make with chickpeas?"
      const byIngredient = db
        .select({ recipeId: schema.recipeIngredient.recipeId })
        .from(schema.recipeIngredient)
        .innerJoin(schema.ingredient, eq(schema.recipeIngredient.ingredientId, schema.ingredient.id))
        .where(ilike(schema.ingredient.name, term));

      filters.push(
        or(ilike(title, term), ilike(description, term), ilike(cuisine, term), inArray(schema.recipe.id, byIngredient))
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

    const paged = await readPagedList({
      filters,
      page,
      pageSize,
      table: schema.recipe,
      read: (query) =>
        db.query.recipe.findMany({
          ...query,
          orderBy:
            sortDirection === 'desc'
              ? [desc(sortColumn), desc(schema.recipe.id)]
              : [asc(sortColumn), asc(schema.recipe.id)],
          with: { creator: creatorWith, tagLinks: { with: { tag: true } } },
        }),
    });

    const recipes = paged.items;
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

    return {
      ...paged,
      items: recipes.map((row) => ({
        ...flattenTags(row),
        ingredientCount: ingredientCountByRecipe.get(row.id) ?? 0,
        stepCount: stepCountByRecipe.get(row.id) ?? 0,
      })),
    };
  }

  public static async read(householdId: number, recipeId: number) {
    return RecipesService.readRecipeWithRelations(householdId, recipeId);
  }

  public static async create(householdId: number, data: CreateRecipe, userId: string) {
    const recipeId = await db.transaction(async (tx) => {
      // Resolved first: a bad id or an unresolvable name must abort before the recipe row exists.
      const lines = await RecipesService.resolveLineIngredients(tx, householdId, data.ingredients ?? []);

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
        throw somethingWentWrong();
      }

      await RecipesService.replaceIngredients(tx, created.id, lines);
      await RecipesService.replaceSteps(tx, created.id, data.steps ?? []);
      await RecipesService.replaceTags(tx, householdId, created.id, data.tags ?? []);

      return created.id;
    });

    return RecipesService.readRecipeWithRelations(householdId, recipeId);
  }

  public static async patch(householdId: number, recipeId: number, data: PatchRecipe) {
    // Read whole rather than as a bare row: three of the four things a save can change are children,
    // and the activity log has to be able to tell "renamed it" from "rewrote the method".
    const existing = await RecipesService.readRecipeWithRelations(householdId, recipeId);

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

    const changeset = changedColumns(existing, set);

    if (data.steps !== undefined && !sameList(existing.steps.map(stepKey), data.steps.map(stepKey))) {
      changeset.push({ field: 'steps' });
    }

    if (data.tags !== undefined && !sameList(tagKeys(existing.tags.map((tag) => tag.name)), tagKeys(data.tags))) {
      changeset.push({ field: 'tags' });
    }

    await db.transaction(async (tx) => {
      // Resolved up front, so a bad id or an unresolvable name aborts before anything is written.
      const lines =
        data.ingredients === undefined
          ? undefined
          : await RecipesService.resolveLineIngredients(tx, householdId, data.ingredients);

      // Compared after resolution, because a line naming a new ingredient only gets its id here.
      if (lines !== undefined && !sameList(existing.ingredients.map(lineKey), lines.map(lineKey))) {
        changeset.push({ field: 'ingredients' });
      }

      // Skip the update when only children changed — an all-undefined `set` has nothing to write.
      if (Object.values(set).some((value) => value !== undefined)) {
        await tx
          .update(schema.recipe)
          .set(set)
          .where(and(eq(schema.recipe.householdId, householdId), eq(schema.recipe.id, recipeId)));
      }

      if (lines !== undefined) {
        await RecipesService.replaceIngredients(tx, recipeId, lines);
      }

      if (data.steps !== undefined) {
        await RecipesService.replaceSteps(tx, recipeId, data.steps);
      }

      if (data.tags !== undefined) {
        await RecipesService.replaceTags(tx, householdId, recipeId, data.tags);
      }
    });

    return { data: await RecipesService.readRecipeWithRelations(householdId, recipeId), changeset };
  }

  /**
   * Deletes a recipe, leaving any meal plan that referenced it readable.
   *
   * The plan rows can't simply follow the FK to NULL: `planned_meal_label_check` requires a recipe or
   * a title, so the recipe's name is copied onto them first. That's the whole point of the check —
   * forgetting this step fails the delete outright instead of quietly producing label-less rows.
   */
  public static async delete(householdId: number, recipeId: number) {
    return db.transaction(async (tx) => {
      const recipe = await RecipesService.readRecipeRow(householdId, recipeId, tx);

      await MealPlanService.detachRecipe(tx, recipeId, recipe.title);

      const [deleted] = await tx
        .delete(schema.recipe)
        .where(and(eq(schema.recipe.householdId, householdId), eq(schema.recipe.id, recipeId)))
        .returning();

      if (!deleted) {
        throw notFound('Recipe');
      }

      return deleted;
    });
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
      throw notFound('Tag');
    }

    return deleted;
  }
}
