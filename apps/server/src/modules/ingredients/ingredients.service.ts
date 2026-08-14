import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '#db/core';
import { type Executor, emptyToNull, type Filters, isUniqueViolation, readPagedList, writesAnything } from '#db/utils';
import { alreadyExists, couldNotResolve, notFound, somethingWentWrong } from '#lib/errors';
import { ShoppingListsService } from '#modules/shopping-lists/shopping-lists.service';
import { StoresService } from '#modules/stores/stores.service';

import {
  type CreateIngredient,
  type ListIngredientsQueryParams,
  type MeasurementUnit,
  type PatchIngredient,
} from './ingredients.model';

/**
 * A name to find-or-create in the library, plus the unit it was used with — a recipe line, in
 * practice. The unit is only a hint: it seeds `defaultUnit` when the row has to be created.
 */
export type ResolvableIngredient = { defaultUnit?: MeasurementUnit | null; name: string };

/**
 * The household's reusable ingredient vocabulary. Recipes reference these rows; shopping lists and
 * meal plans will too, which is why names are deduplicated case-insensitively.
 */
export class IngredientsService {
  /** Resolves an ingredient, scoped to its household so ids from elsewhere 404. */
  private static async readIngredientRow(householdId: number, ingredientId: number) {
    const ingredient = await db.query.ingredient.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, ingredientId)),
    });

    if (!ingredient) {
      throw notFound('Ingredient');
    }

    return ingredient;
  }

  /**
   * An ingredient in the shape the list endpoint returns it — joined shop, recipe count. Every
   * mutation reads back through here so a created or patched row is the same type as a refetched
   * one, which is what lets the web swap a PATCH result straight into its cached list.
   */
  private static async readIngredientWithRelations(householdId: number, ingredientId: number) {
    const ingredient = await db.query.ingredient.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, ingredientId)),
      with: { store: { columns: { id: true, name: true } } },
    });

    if (!ingredient) {
      throw notFound('Ingredient');
    }

    const usage = await IngredientsService.countRecipeUsage([ingredientId]);

    return { ...ingredient, recipeCount: usage.get(ingredientId) ?? 0 };
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
  private static async assertNameAvailable(householdId: number, name: string, excludeId?: number) {
    const filters: Filters = [
      eq(schema.ingredient.householdId, householdId),
      sql`lower(${schema.ingredient.name}) = lower(${name})`,
    ];

    if (excludeId !== undefined) {
      filters.push(ne(schema.ingredient.id, excludeId));
    }

    const [existing] = await db
      .select({ id: schema.ingredient.id })
      .from(schema.ingredient)
      .where(and(...filters))
      .limit(1);

    if (existing) {
      throw alreadyExists(name, 'in your ingredient library');
    }
  }

  /**
   * Maps ingredient names onto household library rows, creating the ones that don't exist yet, and
   * returns them keyed by lowercased name. Matching is case-insensitive, so "Onion" and "onion"
   * resolve to the same row — a fragmented library would silently break shopping-list aggregation.
   *
   * This is the find-or-create half of "an ingredient typed into the recipe form isn't persisted
   * until the recipe is saved": a name that collides with an existing row resolves to it rather
   * than 409ing, since the user's intent is "use this ingredient", not "add a new one".
   *
   * A caller can pass the unit the name was used with, which seeds `defaultUnit` on the rows this
   * creates — the unit a recipe reaches for is nearly always the one the library should default to,
   * and it beats leaving every recipe-born ingredient blank. It only ever applies to rows inserted
   * here: an existing row keeps the default its owner chose, since resolving a name is not consent
   * to rewrite it.
   */
  public static async resolveByName(executor: Executor, householdId: number, lines: ResolvableIngredient[]) {
    // Dedupe case-insensitively, keeping the first spelling the user typed and the first unit that
    // was actually specified — a later line naming a unit shouldn't lose to an earlier blank one.
    const wanted = new Map<string, { defaultUnit: MeasurementUnit | null; name: string }>();
    for (const { defaultUnit, name } of lines) {
      const key = name.toLowerCase();
      const existing = wanted.get(key);

      if (existing) {
        existing.defaultUnit ??= defaultUnit ?? null;
      } else {
        wanted.set(key, { defaultUnit: defaultUnit ?? null, name });
      }
    }

    if (wanted.size === 0) {
      return new Map<string, number>();
    }

    const readMatching = async () =>
      executor
        .select({ id: schema.ingredient.id, name: schema.ingredient.name })
        .from(schema.ingredient)
        .where(
          and(
            eq(schema.ingredient.householdId, householdId),
            inArray(sql`lower(${schema.ingredient.name})`, [...wanted.keys()])
          )
        );

    const existing = await readMatching();
    const byLower = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));
    const missing = [...wanted]
      .filter(([key]) => !byLower.has(key))
      .map(([, { defaultUnit, name }]) => ({ householdId, name, category: 'other' as const, defaultUnit }));

    if (missing.length === 0) {
      return byLower;
    }

    // onConflictDoNothing covers a concurrent save creating the same name; the re-read picks it up.
    await executor.insert(schema.ingredient).values(missing).onConflictDoNothing();

    const refreshed = await readMatching();
    const refreshedByLower = new Map(refreshed.map((row) => [row.name.toLowerCase(), row.id]));

    // Every wanted key must resolve now: it either existed or was just inserted. If one doesn't,
    // something is wrong with the insert — fail rather than quietly saving the recipe minus a line.
    for (const [key, { name }] of wanted) {
      if (!refreshedByLower.has(key)) {
        throw couldNotResolve(`ingredient "${name}"`);
      }
    }

    return refreshedByLower;
  }

  /** The household's ingredient library, with how many recipes each one is used in. */
  public static async list(
    householdId: number,
    { search, category, store, sortKey, sortDirection, page, pageSize }: ListIngredientsQueryParams
  ) {
    const {
      householdId: householdIdColumn,
      name,
      notes,
      category: categoryColumn,
      storeId: storeIdColumn,
    } = schema.ingredient;
    const sortColumn = schema.ingredient[sortKey];

    const filters: Filters = [eq(householdIdColumn, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(name, term), ilike(notes, term)));
    }

    if (category) {
      filters.push(eq(categoryColumn, category));
    }

    if (store === 'none') {
      filters.push(isNull(storeIdColumn));
    } else if (store !== undefined) {
      filters.push(eq(storeIdColumn, store));
    }

    const paged = await readPagedList({
      filters,
      page,
      pageSize,
      table: schema.ingredient,
      read: (query) =>
        db.query.ingredient.findMany({
          ...query,
          orderBy:
            sortDirection === 'desc'
              ? [desc(sortColumn), desc(schema.ingredient.id)]
              : [asc(sortColumn), asc(schema.ingredient.id)],
          with: { store: { columns: { id: true, name: true } } },
        }),
    });

    const usage = await IngredientsService.countRecipeUsage(paged.items.map((row) => row.id));

    return { ...paged, items: paged.items.map((row) => ({ ...row, recipeCount: usage.get(row.id) ?? 0 })) };
  }

  /**
   * The shop to write, from a payload that may name one instead of pointing at one. `storeName`
   * wins: it's what the form sends when the user typed a shop that doesn't exist yet.
   *
   * Runs inside the caller's transaction so a shop minted here dies with a write that then fails on
   * a duplicate ingredient name.
   */
  private static async resolveStoreId(
    executor: Executor,
    householdId: number,
    data: { storeId?: number | null; storeName?: string }
  ) {
    if (data.storeName !== undefined) {
      return StoresService.resolveByName(executor, householdId, data.storeName);
    }

    // A shop id is a client-supplied foreign key, so it's checked rather than trusted — one from
    // another household would otherwise be writable here.
    return StoresService.assertInHousehold(householdId, data.storeId);
  }

  public static async create(householdId: number, data: CreateIngredient) {
    // Before anything is written: a refused name must not leave a shop behind, and this is the check
    // that catches every duplicate except a concurrent one — which the transaction below covers.
    await IngredientsService.assertNameAvailable(householdId, data.name);

    const created = await db.transaction(async (tx) => {
      const storeId = await IngredientsService.resolveStoreId(tx, householdId, data);

      // `assertNameAvailable` above is a TOCTOU window: two concurrent creates of the same name both
      // pass it, and the loser hits the unique index. Translate that into the same 409, not a 500.
      const [row] = await tx
        .insert(schema.ingredient)
        .values({
          householdId,
          name: data.name,
          category: data.category,
          defaultUnit: data.defaultUnit ?? null,
          storeId: storeId ?? null,
          notes: emptyToNull(data.notes),
        })
        .returning({ id: schema.ingredient.id })
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw alreadyExists(data.name, 'in your ingredient library');
          }
          throw error;
        });

      if (!row) {
        throw somethingWentWrong();
      }

      return row;
    });

    return IngredientsService.readIngredientWithRelations(householdId, created.id);
  }

  public static async patch(householdId: number, ingredientId: number, data: PatchIngredient) {
    await IngredientsService.readIngredientRow(householdId, ingredientId);

    if (data.name !== undefined) {
      await IngredientsService.assertNameAvailable(householdId, data.name, ingredientId);
    }

    // Decided before the shop is resolved, so `PATCH {}` can't mint one on its way to doing nothing.
    if (!writesAnything(data)) {
      return IngredientsService.readIngredientWithRelations(householdId, ingredientId);
    }

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.ingredient)
        .set({
          name: data.name,
          category: data.category,
          // `null` clears the unit; `undefined` leaves it alone. Same for the shop.
          defaultUnit: data.defaultUnit,
          storeId: await IngredientsService.resolveStoreId(tx, householdId, data),
          notes: emptyToNull(data.notes),
        })
        .where(and(eq(schema.ingredient.householdId, householdId), eq(schema.ingredient.id, ingredientId)))
        .returning({ id: schema.ingredient.id })
        .catch((error: unknown) => {
          if (data.name !== undefined && isUniqueViolation(error)) {
            throw alreadyExists(data.name, 'in your ingredient library');
          }
          throw error;
        });

      if (!updated) {
        throw notFound('Ingredient');
      }
    });

    return IngredientsService.readIngredientWithRelations(householdId, ingredientId);
  }

  /**
   * Hard delete, blocked while any recipe still uses it — deleting "flour" must not silently gut
   * every recipe that references it. The FK is `restrict`, so this check is the friendly message,
   * not the guarantee.
   *
   * Shopping lists are deliberately *not* a blocker. A recipe is a lasting document; a list is one
   * trip, and refusing a library cleanup because of a six-month-old completed list would be the
   * wrong trade. Their lines keep the name as free text instead, copied on before the FK nulls the
   * link — their check constraint makes the delete fail otherwise, which is what stops this being
   * forgotten.
   */
  public static async delete(householdId: number, ingredientId: number) {
    const ingredient = await IngredientsService.readIngredientRow(householdId, ingredientId);

    const usage = await IngredientsService.countRecipeUsage([ingredientId]);
    const recipeCount = usage.get(ingredientId) ?? 0;

    if (recipeCount > 0) {
      throw new HTTPException(409, {
        message: `This ingredient is used in ${recipeCount} recipe${recipeCount === 1 ? '' : 's'}. Remove it from them first.`,
      });
    }

    const deleted = await db.transaction(async (tx) => {
      await ShoppingListsService.detachIngredient(tx, ingredientId, ingredient.name);

      const [row] = await tx
        .delete(schema.ingredient)
        .where(and(eq(schema.ingredient.householdId, householdId), eq(schema.ingredient.id, ingredientId)))
        .returning();

      return row;
    });

    if (!deleted) {
      throw notFound('Ingredient');
    }

    return deleted;
  }
}
