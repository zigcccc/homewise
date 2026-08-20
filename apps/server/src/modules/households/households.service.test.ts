import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { HouseholdsService } from '#modules/households/households.service';
import { MealPlanService } from '#modules/meal-plan/meal-plan.service';
import { createHousehold } from '#tests/households';

/**
 * What changing a role does to rows that were written while the old one applied.
 *
 * Not reachable from a spec: the meal survives the role change, so through the UI you would be
 * asserting the *absence* of a name on a card that still renders — and the row it comes from is the
 * thing actually at stake.
 */
describe('HouseholdsService.patchHouseholdMemberRole', () => {
  const assignedMemberIds = async (mealId: number) =>
    (
      await db
        .select({ id: schema.plannedMealMember.householdMemberId })
        .from(schema.plannedMealMember)
        .where(eq(schema.plannedMealMember.plannedMealId, mealId))
    ).map(({ id }) => id);

  const setup = async (label: string) => {
    const { householdId, userId } = await createHousehold(label);
    const [member] = await HouseholdsService.addHouseholdMembers(householdId, [{ name: 'Robin', role: 'child' }]);
    const meal = await MealPlanService.createMeal(
      householdId,
      { day: '2099-05-04', title: 'Lunch', memberIds: [member!.id] },
      userId
    );

    return { householdId, mealId: meal.id, memberId: member!.id };
  };

  it('should drop a member out of their meals when they stop eating off the plan', async () => {
    // GIVEN: a child assigned to a meal
    const { householdId, mealId, memberId } = await setup('role-change-out');
    expect(await assignedMemberIds(mealId)).toEqual([memberId]);

    // WHEN: they become an external member, who eats elsewhere by definition
    await HouseholdsService.patchHouseholdMemberRole(householdId, memberId, 'external');

    // THEN: the assignment goes with the role — nothing else would ever remove it, and the meal
    // would keep counting someone the headcount no longer includes.
    expect(await assignedMemberIds(mealId)).toEqual([]);
  });

  it('should leave the meals alone when the new role still eats', async () => {
    // GIVEN: the same child on the same meal
    const { householdId, mealId, memberId } = await setup('role-change-stays');

    // WHEN: they are promoted to an adult, who does eat off the plan
    await HouseholdsService.patchHouseholdMemberRole(householdId, memberId, 'adult');

    // THEN: they are still fed
    expect(await assignedMemberIds(mealId)).toEqual([memberId]);
  });

  it('should refuse to make an account holder a pet', async () => {
    // GIVEN: a member with an account behind it
    const { householdId, userId } = await createHousehold('role-change-pet');
    const [member] = await db
      .insert(schema.householdMember)
      .values({ householdId, userId, name: 'Adult', role: 'adult' })
      .returning();

    // THEN: it can never become the one role that is never an account holder
    await expect(HouseholdsService.patchHouseholdMemberRole(householdId, member!.id, 'pet')).rejects.toThrow();
  });
});
