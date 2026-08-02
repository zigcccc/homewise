import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';
import { type Executor, emptyToNull } from '@/db/utils';
import { addDays, eachDayInclusive, startOfISOWeek, todayISO } from '@/lib/dates';
import { HouseholdsService } from '@/modules/households/households.service';

import {
  type CreatePlannedMeal,
  MAX_RANGE_DAYS,
  MEAL_LABEL_ERROR,
  type MealPlanRangeQueryParams,
  type PatchPlannedMeal,
} from './models';

/** Appending: clamped to the end of the day's list by `resequenceDay`. */
const APPEND = Number.MAX_SAFE_INTEGER;

const memberWith = {
  with: { member: { with: { user: { columns: { id: true, name: true } } } } },
} as const;

const recipeColumns = { columns: { id: true, title: true, archived: true } } as const;

/** A planned meal as the two reads below join it — the shape `toMealResponse` flattens. */
type PlannedMealRow = typeof schema.plannedMeal.$inferSelect & {
  recipe: { id: number; title: string; archived: boolean } | null;
  members: {
    member: { id: number; name: string | null; nickname: string | null; user: { name: string } | null };
  }[];
};

/**
 * Lunch, planned by date. Fully collaborative — any member can add, move and remove a meal.
 *
 * There is no "plan" aggregate to load: everything here reads or writes rows keyed by a plain
 * calendar day, which is what makes planning three weeks ahead the same operation as planning one.
 */
export class MealPlanService {
  /** Resolves a meal, scoped to its household so ids from elsewhere 404 rather than leak. */
  private static async readMealRow(householdId: number, mealId: number, executor: Executor = db) {
    const meal = await executor.query.plannedMeal.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, mealId)),
    });

    if (!meal) {
      throw new HTTPException(404, { message: 'Meal not found' });
    }

    return meal;
  }

  /** Re-reads a meal joined the same way the range read joins, so a mutation returns the read shape. */
  private static async readMealWithRelations(householdId: number, mealId: number) {
    const meal = await db.query.plannedMeal.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, mealId)),
      with: { members: memberWith, recipe: recipeColumns },
    });

    if (!meal) {
      throw new HTTPException(404, { message: 'Meal not found' });
    }

    return MealPlanService.toMealResponse(meal);
  }

  /**
   * Flattens the join rows and resolves the label, so no client has to do either.
   *
   * The audit columns are dropped on the way out: nothing renders them, and the range read ships one
   * of these per meal for up to 63 days.
   */
  private static toMealResponse(meal: PlannedMealRow) {
    return {
      id: meal.id,
      day: meal.day,
      position: meal.position,
      recipeId: meal.recipeId,
      title: meal.title,
      note: meal.note,
      recipe: meal.recipe,
      /** What to show on the card: the recipe's live title, or the free text standing in for it. */
      label: meal.recipe?.title ?? meal.title ?? 'Untitled',
      /** Empty means everyone — the absence of rows *is* the representation. */
      members: meal.members.map(({ member }) => ({
        id: member.id,
        displayName: HouseholdsService.memberDisplayName(member),
      })),
    };
  }

  /** Rejects a recipe id from another household — otherwise a plan could point at someone else's row. */
  private static async assertRecipeInHousehold(executor: Executor, householdId: number, recipeId: number) {
    const found = await executor.query.recipe.findFirst({
      columns: { id: true },
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, recipeId)),
    });

    if (!found) {
      throw new HTTPException(404, { message: 'Recipe not found' });
    }
  }

  /**
   * Same guard for the people a meal is assigned to.
   *
   * Deduplicated before the count comparison, because the query returns distinct rows: `[7, 7]` would
   * otherwise find one row for two ids and 404 on a member that is perfectly valid. `replaceMembers`
   * already tolerates repeats, so rejecting them here was never intended.
   */
  private static async assertMembersInHousehold(executor: Executor, householdId: number, ids: number[]) {
    const unique = [...new Set(ids)];

    if (unique.length === 0) {
      return;
    }

    const found = await executor
      .select({ id: schema.householdMember.id })
      .from(schema.householdMember)
      .where(and(eq(schema.householdMember.householdId, householdId), inArray(schema.householdMember.id, unique)));

    if (found.length !== unique.length) {
      throw new HTTPException(404, { message: 'Household member not found' });
    }
  }

  /**
   * Copies a recipe's title onto every plan row that references it, and drops the link.
   *
   * Called by `RecipesService.delete` inside its transaction, immediately before the recipe row goes.
   * Skipping it doesn't corrupt anything quietly — `planned_meal_label_check` rejects the resulting
   * label-less rows and the delete fails outright, which is exactly why the constraint is there.
   */
  public static async detachRecipe(executor: Executor, recipeId: number, title: string) {
    await executor
      .update(schema.plannedMeal)
      .set({ recipeId: null, title })
      .where(eq(schema.plannedMeal.recipeId, recipeId));
  }

  /** Replace-all: the submitted set becomes the meal's assignment. Empty clears it back to everyone. */
  private static async replaceMembers(executor: Executor, mealId: number, memberIds: number[]) {
    await executor.delete(schema.plannedMealMember).where(eq(schema.plannedMealMember.plannedMealId, mealId));

    const unique = [...new Set(memberIds)];

    if (unique.length === 0) {
      return;
    }

    await executor
      .insert(schema.plannedMealMember)
      .values(unique.map((householdMemberId) => ({ plannedMealId: mealId, householdMemberId })))
      .onConflictDoNothing();
  }

  /**
   * Renumbers one day's meals to `0..n-1`, optionally splicing a meal in at a given index.
   *
   * One routine covers appending on create, reordering within a day, and both halves of a move: the
   * target day is rebuilt with the meal spliced in, the source day is rebuilt without it. The moved
   * meal's `day` must already be updated when this runs — the `ne(id)` exclusion is what keeps it
   * from being counted twice on its new day.
   *
   * A day holds one meal, occasionally four, so N single-row updates cost nothing here; revisit if a
   * day ever holds hundreds. Concurrent moves are last-write-wins, reconciled by the realtime
   * invalidation that follows — correct for a shared plan, and not worth row locks.
   */
  private static async resequenceDay(
    executor: Executor,
    householdId: number,
    day: string,
    place?: { mealId: number; index: number }
  ) {
    const siblings = await executor
      .select({ id: schema.plannedMeal.id })
      .from(schema.plannedMeal)
      .where(
        and(
          eq(schema.plannedMeal.householdId, householdId),
          eq(schema.plannedMeal.day, day),
          place ? ne(schema.plannedMeal.id, place.mealId) : undefined
        )
      )
      .orderBy(asc(schema.plannedMeal.position), asc(schema.plannedMeal.id));

    const ids = siblings.map((row) => row.id);

    if (place) {
      ids.splice(Math.min(Math.max(place.index, 0), ids.length), 0, place.mealId);
    }

    for (const [index, id] of ids.entries()) {
      await executor.update(schema.plannedMeal).set({ position: index }).where(eq(schema.plannedMeal.id, id));
    }
  }

  /**
   * The window of days, densely filled — every day between `from` and `to` comes back, empty ones
   * included, so the client never has to reconstruct the gaps.
   *
   * Returns the range it actually read. An over-long request is clamped rather than rejected, and
   * without the effective range in the response a client asking for 90 days would render 27
   * permanently blank rows — indistinguishable, on screen, from the plan having been deleted.
   */
  public static async listRange(householdId: number, params: MealPlanRangeQueryParams) {
    const from = params.from ?? startOfISOWeek(todayISO());
    const maxTo = addDays(from, MAX_RANGE_DAYS - 1);
    const requested = params.to ?? addDays(from, 6);

    // Never inverted, never longer than the cap.
    let to = requested;
    if (to < from) {
      to = from;
    }
    if (to > maxTo) {
      to = maxTo;
    }

    const [meals, notes] = await Promise.all([
      db.query.plannedMeal.findMany({
        where: (fields, { and, eq, gte, lte }) =>
          and(eq(fields.householdId, householdId), gte(fields.day, from), lte(fields.day, to)),
        // `id` is the tiebreaker, so two meals sharing a position never flip order between reads.
        orderBy: (fields, { asc }) => [asc(fields.day), asc(fields.position), asc(fields.id)],
        with: { members: memberWith, recipe: recipeColumns },
      }),
      db
        .select({ day: schema.plannedDayNote.day, note: schema.plannedDayNote.note })
        .from(schema.plannedDayNote)
        .where(
          and(
            eq(schema.plannedDayNote.householdId, householdId),
            gte(schema.plannedDayNote.day, from),
            lte(schema.plannedDayNote.day, to)
          )
        ),
    ]);

    const noteByDay = new Map(notes.map(({ day, note }) => [day, note]));

    return {
      from,
      to,
      days: eachDayInclusive(from, to).map((day) => ({ day, note: noteByDay.get(day) ?? null })),
      meals: meals.map(MealPlanService.toMealResponse),
    };
  }

  public static async createMeal(householdId: number, data: CreatePlannedMeal, userId: string) {
    const mealId = await db.transaction(async (tx) => {
      // Everything that can fail is resolved before the row exists, so a bad id leaves nothing behind.
      if (data.recipeId != null) {
        await MealPlanService.assertRecipeInHousehold(tx, householdId, data.recipeId);
      }
      if (data.memberIds) {
        await MealPlanService.assertMembersInHousehold(tx, householdId, data.memberIds);
      }

      const [created] = await tx
        .insert(schema.plannedMeal)
        .values({
          householdId,
          day: data.day,
          position: 0,
          recipeId: data.recipeId ?? null,
          title: emptyToNull(data.title) ?? null,
          note: emptyToNull(data.note) ?? null,
          createdBy: userId,
        })
        .returning();

      if (!created) {
        throw new HTTPException(400, { message: 'Something went wrong.' });
      }

      await MealPlanService.resequenceDay(tx, householdId, data.day, {
        mealId: created.id,
        index: data.position ?? APPEND,
      });

      if (data.memberIds?.length) {
        await MealPlanService.replaceMembers(tx, created.id, data.memberIds);
      }

      return created.id;
    });

    return MealPlanService.readMealWithRelations(householdId, mealId);
  }

  public static async patchMeal(householdId: number, mealId: number, data: PatchPlannedMeal) {
    await db.transaction(async (tx) => {
      const existing = await MealPlanService.readMealRow(householdId, mealId, tx);
      const targetDay = data.day ?? existing.day;

      if (data.recipeId != null) {
        await MealPlanService.assertRecipeInHousehold(tx, householdId, data.recipeId);
      }
      if (data.memberIds) {
        await MealPlanService.assertMembersInHousehold(tx, householdId, data.memberIds);
      }

      // Re-checked against the merged row: every patch field is optional, so the create model's
      // refine can't ride along, and `{ recipeId: null }` on a recipe-backed meal would otherwise
      // leave it with no label at all.
      const nextRecipeId = data.recipeId === undefined ? existing.recipeId : (data.recipeId ?? null);
      const nextTitle = data.title === undefined ? existing.title : (emptyToNull(data.title) ?? null);

      if (nextRecipeId === null && nextTitle === null) {
        throw new HTTPException(400, { message: MEAL_LABEL_ERROR });
      }

      await tx
        .update(schema.plannedMeal)
        .set({
          day: targetDay,
          recipeId: nextRecipeId,
          title: nextTitle,
          note: data.note === undefined ? undefined : (emptyToNull(data.note) ?? null),
        })
        .where(and(eq(schema.plannedMeal.householdId, householdId), eq(schema.plannedMeal.id, mealId)));

      if (data.day !== undefined || data.position !== undefined) {
        // Target first — the meal's `day` is already updated, so it's excluded and re-spliced here.
        await MealPlanService.resequenceDay(tx, householdId, targetDay, {
          mealId,
          index: data.position ?? APPEND,
        });

        // Then close the gap it left behind.
        if (targetDay !== existing.day) {
          await MealPlanService.resequenceDay(tx, householdId, existing.day);
        }
      }

      if (data.memberIds !== undefined) {
        await MealPlanService.replaceMembers(tx, mealId, data.memberIds);
      }
    });

    return MealPlanService.readMealWithRelations(householdId, mealId);
  }

  public static async deleteMeal(householdId: number, mealId: number) {
    return db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(schema.plannedMeal)
        .where(and(eq(schema.plannedMeal.householdId, householdId), eq(schema.plannedMeal.id, mealId)))
        .returning();

      if (!deleted) {
        throw new HTTPException(404, { message: 'Meal not found' });
      }

      await MealPlanService.resequenceDay(tx, householdId, deleted.day);

      return deleted;
    });
  }

  /** Sets or clears a day's note. An empty note removes the row rather than storing a blank one. */
  public static async putDayNote(householdId: number, day: string, note: string) {
    if (note === '') {
      await db
        .delete(schema.plannedDayNote)
        .where(and(eq(schema.plannedDayNote.householdId, householdId), eq(schema.plannedDayNote.day, day)));

      return { day, note: null };
    }

    const [saved] = await db
      .insert(schema.plannedDayNote)
      .values({ householdId, day, note })
      .onConflictDoUpdate({
        target: [schema.plannedDayNote.householdId, schema.plannedDayNote.day],
        set: { note },
      })
      .returning();

    if (!saved) {
      throw new HTTPException(400, { message: 'Something went wrong.' });
    }

    return { day: saved.day, note: saved.note };
  }
}
