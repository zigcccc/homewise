import z from 'zod';

import { optionalText } from '#lib/models';
import { type HouseholdMemberRole, householdMemberRole } from '#modules/households/households.model';

/**
 * Who eats off the plan. A pet doesn't, and an external member is by definition eating elsewhere —
 * neither belongs in the "who's eating this?" picker, in the count of who still needs a meal, or in
 * the headcount a shopping-list import scales its amounts to. A `null` role is none of these either,
 * so it doesn't count.
 *
 * Lives here rather than in `households` because it is a statement about meals, not about the
 * roster; and on the server rather than on the web because the import's headcount needs it too, and
 * a second copy would let the two disagree about who's eating.
 */
export const MEAL_ROLES: HouseholdMemberRole[] = [householdMemberRole.enum.adult, householdMemberRole.enum.child];

/**
 * `z.iso.date()` accepts anything shaped like a date, including `3000-01-01`. A plan lives on a
 * calendar the UI can actually navigate to, so a fat-fingered year is a typo rather than a request —
 * bounding it here keeps a row from landing somewhere nothing can reach it again.
 */
const planDay = z.iso
  .date({ error: 'Use a valid date' })
  .refine((value) => value >= '2000-01-01' && value <= '2100-12-31', { error: 'Pick a date this century' });

/** How far a single range read may reach. `MealPlanService.listRange` clamps to it rather than 400ing. */
export const MAX_RANGE_DAYS = 63;

/**
 * A meal needs a label from somewhere. Shared because the rule is enforced twice: here for a create,
 * and again in `patchMeal` against the merged row, since a patch's fields are all optional.
 */
export const MEAL_LABEL_ERROR = 'Pick a recipe or give the meal a name';

const mealTitle = optionalText(120, 'Name');

/**
 * The same field as `mealTitle`, but required — for editing a custom meal's label in place, where
 * clearing it isn't "leave the title alone" but "this meal has no label", which the DB refuses.
 */
export const plannedMealTitle = z
  .string()
  .trim()
  .min(1, { error: 'Give the meal a name' })
  .max(120, { error: 'Name must contain at most 120 characters' });

const memberIds = z.array(z.number().int().positive()).max(50, { error: 'Too many people for one meal' }).optional();

const position = z.number().int().nonnegative().optional();

/** A recipe to read the label off, or free text. The DB `CHECK` is the backstop for the same rule. */
const hasLabel = (data: { recipeId?: number | null; title?: string }) =>
  (data.recipeId !== undefined && data.recipeId !== null) || (data.title !== undefined && data.title.trim() !== '');

const labelError = { error: MEAL_LABEL_ERROR, path: ['title'] };

/**
 * These two stay hand-written rather than deriving from `planned_meal`: `memberIds` is a join table,
 * and `position` is a slot request the service resequences a day around. The payload is a command,
 * not the row — the same reason the shopping-list item models aren't derived either.
 */
export const createPlannedMealModel = z
  .object({
    day: planDay,
    /** An existing recipe in this household. Its title is read live, not copied. */
    recipeId: z.number().int().positive().nullish(),
    /** Free-text label for something with no recipe — "leftovers", "at work". */
    title: mealTitle,
    note: optionalText(500, 'Note'),
    /** Who's eating it. Omitted or empty means everyone. */
    memberIds,
    position,
  })
  .refine(hasLabel, labelError);
export type CreatePlannedMeal = z.infer<typeof createPlannedMealModel>;

/**
 * Every field optional, so the label rule can't be expressed here — a patch that only moves a meal
 * carries neither a recipe nor a title and is perfectly valid. `MealPlanService.patchMeal` re-checks
 * it against the merged row instead.
 *
 * `memberIds: []` clears the assignment (back to "everyone"); omitting the key leaves it alone.
 * Collapsing those two would make "this is for everyone again" impossible to express.
 */
export const patchPlannedMealModel = z.object({
  day: planDay.optional(),
  recipeId: z.number().int().positive().nullish(),
  title: mealTitle,
  note: optionalText(500, 'Note'),
  memberIds,
  position,
});
export type PatchPlannedMeal = z.infer<typeof patchPlannedMealModel>;

export const plannedMealPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const mealPlanDayPathParamsModel = z.object({ day: planDay });

/** An empty note clears the day's note row rather than storing a blank one. */
export const putDayNoteModel = z.object({
  note: z.string().trim().max(500, { error: 'Note must contain at most 500 characters' }),
});
export type PutDayNote = z.infer<typeof putDayNoteModel>;

/**
 * The window to read. Both ends degrade to the current week rather than 400-ing, per the house rule
 * for list params — and an over-long range is clamped in the service, not rejected.
 */
export const mealPlanRangeQueryParamsModel = z.object({
  from: planDay.optional().catch(undefined),
  to: planDay.optional().catch(undefined),
});
export type MealPlanRangeQueryParams = z.infer<typeof mealPlanRangeQueryParamsModel>;
