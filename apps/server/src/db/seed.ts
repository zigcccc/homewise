import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { addDays, startOfISOWeek, todayISO } from '../lib/dates';
import * as schema from './schema/core';
import {
  SEED_CHILD_MEMBER,
  SEED_HOUSEHOLD_NAME,
  SEED_INGREDIENTS,
  SEED_MEAL_PLAN,
  SEED_ONBOARDING_USER,
  SEED_RECIPE,
  SEED_SECOND_USER,
  SEED_STORES,
  SEED_USER,
} from './seed-fixtures';

type SeededUser = typeof schema.user.$inferSelect;
type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Idempotent by unique email: returns the existing user, or creates one with a
 * credential account so it can actually log in. Wrapped in a transaction so a
 * failure can't leave a user without its account (which a later rerun would then
 * skip over). Shared by every seeded account (owner, second member, onboarding).
 */
async function ensureUser(db: SeedDb, fixture: { email: string; name: string; password: string }): Promise<SeededUser> {
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, fixture.email));
  if (existing) {
    console.log(`▸ user ${fixture.email} already present — skipping`);
    return existing;
  }

  const userId = randomUUID();
  // Hash with better-auth's own hasher so the seeded user can actually log in.
  const hashedPassword = await hashPassword(fixture.password);

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.user)
      .values({ id: userId, name: fixture.name, email: fixture.email, emailVerified: true, role: 'user' })
      .returning();

    await tx.insert(schema.account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPassword,
    });

    return inserted;
  });

  if (!created) {
    throw new Error(`failed to create seed user ${fixture.email}`);
  }
  console.log(`▸ seeded user ${fixture.email}`);
  return created;
}

/**
 * Idempotent seed for preview and local test databases.
 *
 * Each Vercel preview deploy runs against its own fresh Neon branch, and the
 * e2e suite runs against a dedicated local test DB, so this script establishes a
 * known, deterministic starting state (a verified user that can log in, one
 * household, a couple of members). It is safe to re-run: every step checks for
 * existing data first, and each fixture is created inside a transaction, so
 * reruns never duplicate rows, leave partial state, or error out. The fixture
 * values live in `seed-fixtures.ts` and are shared with the e2e tests.
 *
 * Run via `pnpm db:seed`. DATABASE_URL is provided by the caller (the guarded
 * preview build points it at the unpooled/direct Neon endpoint; the e2e local
 * setup points it at the test Postgres).
 */

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    // 0. Optional reset. Wipe all data first so the DB is empty-then-seeded and
    // deterministic. Two callers set SEED_RESET:
    //   - the guarded Vercel preview build (Neon branches previews off prod, so
    //     the branch starts as a copy-on-write clone of prod data), and
    //   - the local e2e setup, which runs against a dedicated throwaway test DB.
    // The schema and drizzle migration journal are left intact (the journal lives
    // in the `drizzle` schema).
    if (process.env.SEED_RESET === 'true') {
      // Destructive — allowed only where the target DB is guaranteed disposable:
      //   (a) a Vercel preview build: BOTH VERCEL=1 (a local shell never has it)
      //       AND VERCEL_ENV=preview. VERCEL_ENV alone is caller-controlled and
      //       not tied to which DB DATABASE_URL points at, so demanding VERCEL=1
      //       blocks running SEED_RESET locally against a prod/staging URL; or
      //   (b) NODE_ENV=test: the e2e suite's isolated local test Postgres.
      // Anything else (dev/prod) is rejected so a real DATABASE_URL can never be
      // truncated.
      const isPreviewBuild = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'preview';
      const isTestEnv = process.env.NODE_ENV === 'test';
      if (!isPreviewBuild && !isTestEnv) {
        throw new Error(
          'refusing to reset: SEED_RESET requires a Vercel preview build (VERCEL=1 and VERCEL_ENV=preview) or NODE_ENV=test'
        );
      }
      console.log('▸ SEED_RESET=true — truncating all public tables (empty DB before seed)');
      await pool.query(`
        DO $$
        DECLARE r RECORD;
        BEGIN
          FOR r IN
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
          LOOP
            EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.tablename);
          END LOOP;
        END $$;
      `);
    }

    // 1. User + credential account, created atomically (idempotent by unique email).
    const user = await ensureUser(db, SEED_USER);
    const ownerId = user.id;

    // 2. Household + members, created atomically (idempotent by owner).
    let [household] = await db.select().from(schema.household).where(eq(schema.household.ownerId, ownerId));

    if (!household) {
      household = await db.transaction(async (tx) => {
        const [created] = await tx.insert(schema.household).values({ name: SEED_HOUSEHOLD_NAME, ownerId }).returning();

        if (!created) {
          throw new Error('failed to create seed household');
        }

        await tx.insert(schema.householdMember).values([
          { householdId: created.id, userId: ownerId, name: SEED_USER.name, role: 'adult' },
          {
            householdId: created.id,
            name: SEED_CHILD_MEMBER.name,
            nickname: SEED_CHILD_MEMBER.nickname,
            role: 'child',
          },
        ]);

        return created;
      });

      console.log('▸ seeded preview household with members');
    } else {
      console.log('▸ preview household already present — skipping');
    }

    if (!household) {
      throw new Error('failed to resolve seed household');
    }

    // 3. Second account user, seeded as a non-owner adult member (idempotent by
    // userId + householdId). Gives the e2e suite a second account-linked member
    // for the owner-only flows (transfer ownership, change a member's role).
    const secondUser = await ensureUser(db, SEED_SECOND_USER);
    const [secondMembership] = await db
      .select()
      .from(schema.householdMember)
      .where(
        and(eq(schema.householdMember.householdId, household.id), eq(schema.householdMember.userId, secondUser.id))
      );
    if (!secondMembership) {
      await db.insert(schema.householdMember).values({
        householdId: household.id,
        userId: secondUser.id,
        name: SEED_SECOND_USER.name,
        role: 'adult',
      });
      console.log('▸ seeded second household member');
    } else {
      console.log('▸ second household member already present — skipping');
    }

    // 4. Onboarding user — a real account with NO household/membership, so the
    // e2e onboarding spec can create one from a clean slate.
    await ensureUser(db, SEED_ONBOARDING_USER);

    // 5. Shops, before the ingredients that point at them (idempotent by household
    // + lower(name), matching the unique index).
    const existingStores = await db.select().from(schema.store).where(eq(schema.store.householdId, household.id));
    const storeIdByName = new Map(existingStores.map((row) => [row.name.toLowerCase(), row.id]));
    const missingStores = SEED_STORES.filter((fixture) => !storeIdByName.has(fixture.name.toLowerCase()));

    if (missingStores.length > 0) {
      const inserted = await db
        .insert(schema.store)
        .values(missingStores.map((fixture) => ({ householdId: household.id, name: fixture.name })))
        .returning();

      for (const row of inserted) {
        storeIdByName.set(row.name.toLowerCase(), row.id);
      }
      console.log(`▸ seeded ${inserted.length} stores`);
    } else {
      console.log('▸ stores already present — skipping');
    }

    // 6. Ingredient library — pantry staples, so the recipe form's picker is never
    // empty (idempotent by household + lower(name), matching the unique index).
    const existingIngredients = await db
      .select()
      .from(schema.ingredient)
      .where(eq(schema.ingredient.householdId, household.id));
    const ingredientIdByName = new Map(existingIngredients.map((row) => [row.name.toLowerCase(), row.id]));
    const missingIngredients = SEED_INGREDIENTS.filter(
      (fixture) => !ingredientIdByName.has(fixture.name.toLowerCase())
    );

    if (missingIngredients.length > 0) {
      const inserted = await db
        .insert(schema.ingredient)
        .values(
          missingIngredients.map((fixture) => ({
            householdId: household.id,
            name: fixture.name,
            category: fixture.category,
            defaultUnit: fixture.defaultUnit,
            storeId: fixture.store === null ? null : (storeIdByName.get(fixture.store.toLowerCase()) ?? null),
          }))
        )
        .returning();

      for (const row of inserted) {
        ingredientIdByName.set(row.name.toLowerCase(), row.id);
      }
      console.log(`▸ seeded ${inserted.length} ingredients`);
    } else {
      console.log('▸ ingredients already present — skipping');
    }

    // Shops arrived after the ingredient fixtures did, so a database seeded before then has them all
    // unfiled. Only the ones still without a shop, so a deliberate reassignment isn't undone.
    const unfiled = existingIngredients.filter((row) => row.storeId === null);

    for (const row of unfiled) {
      const fixture = SEED_INGREDIENTS.find((entry) => entry.name.toLowerCase() === row.name.toLowerCase());
      const storeId = fixture?.store ? (storeIdByName.get(fixture.store.toLowerCase()) ?? null) : null;

      if (storeId !== null) {
        await db.update(schema.ingredient).set({ storeId }).where(eq(schema.ingredient.id, row.id));
      }
    }

    // 7. One complete recipe (idempotent by household + title), so the list, the
    // detail view and search-by-ingredient all have known data to read.
    const [existingRecipe] = await db
      .select()
      .from(schema.recipe)
      .where(and(eq(schema.recipe.householdId, household.id), eq(schema.recipe.title, SEED_RECIPE.title)));

    if (!existingRecipe) {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.recipe)
          .values({
            householdId: household.id,
            title: SEED_RECIPE.title,
            description: SEED_RECIPE.description,
            mealType: SEED_RECIPE.mealType,
            cuisine: SEED_RECIPE.cuisine,
            servings: SEED_RECIPE.servings,
            prepTimeMinutes: SEED_RECIPE.prepTimeMinutes,
            cookTimeMinutes: SEED_RECIPE.cookTimeMinutes,
            sourceName: SEED_RECIPE.sourceName,
            createdBy: ownerId,
          })
          .returning();

        if (!created) {
          throw new Error('failed to create seed recipe');
        }

        await tx.insert(schema.recipeIngredient).values(
          SEED_RECIPE.ingredients.map((line, index) => {
            const ingredientId = ingredientIdByName.get(line.name.toLowerCase());
            if (ingredientId === undefined) {
              throw new Error(`seed recipe references unknown ingredient "${line.name}"`);
            }

            return {
              recipeId: created.id,
              ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              note: line.note ?? null,
              position: index,
            };
          })
        );

        await tx
          .insert(schema.recipeStep)
          .values(
            SEED_RECIPE.steps.map((instruction, index) => ({ recipeId: created.id, position: index, instruction }))
          );

        await tx
          .insert(schema.recipeTag)
          .values(SEED_RECIPE.tags.map((name) => ({ householdId: household.id, name })))
          .onConflictDoNothing();

        // Re-read rather than using the insert's `returning()`: onConflictDoNothing omits rows that
        // already existed, so a tag left over from an earlier seed would never get linked.
        const tags = await tx
          .select({ id: schema.recipeTag.id })
          .from(schema.recipeTag)
          .where(
            and(eq(schema.recipeTag.householdId, household.id), inArray(schema.recipeTag.name, [...SEED_RECIPE.tags]))
          );

        if (tags.length > 0) {
          await tx.insert(schema.recipeTagLink).values(tags.map((tag) => ({ recipeId: created.id, tagId: tag.id })));
        }
      });

      console.log('▸ seeded preview recipe');
    } else {
      console.log('▸ preview recipe already present — skipping');
    }

    // 8. A planned week, so the meal plan opens on something. Days are resolved from *this* week's
    //    Monday at seed time — a literal date would fall into the past and leave the default view
    //    blank again a week later.
    const monday = startOfISOWeek(todayISO());
    const dayFromOffset = (offset: number) => addDays(monday, offset);

    const [existingPlan] = await db
      .select({ id: schema.plannedMeal.id })
      .from(schema.plannedMeal)
      .where(eq(schema.plannedMeal.householdId, household.id))
      .limit(1);

    if (!existingPlan) {
      const householdMembers = await db
        .select({ id: schema.householdMember.id, name: schema.householdMember.name })
        .from(schema.householdMember)
        .where(eq(schema.householdMember.householdId, household.id));

      const [seedRecipeRow] = await db
        .select({ id: schema.recipe.id })
        .from(schema.recipe)
        .where(and(eq(schema.recipe.householdId, household.id), eq(schema.recipe.title, SEED_RECIPE.title)));

      await db.transaction(async (tx) => {
        for (const [position, meal] of SEED_MEAL_PLAN.meals.entries()) {
          const [created] = await tx
            .insert(schema.plannedMeal)
            .values({
              householdId: household.id,
              day: dayFromOffset(meal.dayOffset),
              position,
              recipeId: 'recipeTitle' in meal ? (seedRecipeRow?.id ?? null) : null,
              // A recipe-backed meal reads its label off the join, so `title` stays null.
              title: 'title' in meal ? meal.title : null,
              createdBy: user.id,
            })
            .returning();

          const assignees = householdMembers.filter((member) =>
            (meal.memberNames as readonly string[]).includes(member.name ?? '')
          );

          if (created && assignees.length > 0) {
            await tx
              .insert(schema.plannedMealMember)
              .values(assignees.map((member) => ({ plannedMealId: created.id, householdMemberId: member.id })));
          }
        }

        await tx
          .insert(schema.plannedDayNote)
          .values(
            SEED_MEAL_PLAN.notes.map((note) => ({
              householdId: household.id,
              day: dayFromOffset(note.dayOffset),
              note: note.note,
            }))
          )
          .onConflictDoNothing();
      });

      console.log('▸ seeded preview meal plan');
    } else {
      console.log('▸ preview meal plan already present — skipping');
    }

    console.log('✓ seed complete');
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('✗ seed failed:', error);
  process.exit(1);
});
