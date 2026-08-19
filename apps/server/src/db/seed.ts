import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { addDays, endOfMonth, startOfISOWeek, startOfMonth, todayISO } from '../lib/dates';
import * as schema from './schema/core';
import {
  SEED_ACTIVITY,
  SEED_CHILD_DOCTOR,
  SEED_CHILD_MEMBER,
  SEED_CHILD_PROFILE,
  SEED_EXPENSE_CATEGORIES,
  SEED_EXPENSES,
  SEED_HOUSEHOLD_NAME,
  SEED_INGREDIENTS,
  SEED_MEAL_PLAN,
  SEED_PET_MEMBER,
  SEED_RECIPE,
  SEED_STORAGE_CONTACT,
  SEED_STORAGE_ITEMS,
  SEED_STORAGE_LOCATIONS,
  SEED_STORES,
  seedAccounts,
} from './seed-fixtures';

type SeededUser = typeof schema.user.$inferSelect;
type SeedDb = ReturnType<typeof drizzle<typeof schema>>;
type SeedAccounts = ReturnType<typeof seedAccounts>;

/**
 * Idempotent by unique email: returns the existing user, or creates one with a
 * credential account so it can actually log in. Wrapped in a transaction so a
 * failure can't leave a user without its account (which a later rerun would then
 * skip over). Shared by every seeded account (owner, second member, onboarding).
 */
async function ensureUser(
  db: SeedDb,
  fixture: { email: string; name: string; password: string },
  log: (message: string) => void
): Promise<SeededUser> {
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, fixture.email));
  if (existing) {
    log(`user ${fixture.email} already present — skipping`);
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
      // better-auth 1.7 matches the credential account on this too — omit it and the seeded user
      // exists but cannot log in, which reads as "Invalid email or password".
      issuer: 'local:credential',
      userId,
      password: hashedPassword,
    });

    return inserted;
  });

  if (!created) {
    throw new Error(`failed to create seed user ${fixture.email}`);
  }
  log(`seeded user ${fixture.email}`);
  return created;
}

/**
 * Everything one seeded household holds — its three accounts, its members, and every fixture the
 * e2e suite reads.
 *
 * Called once per slot. `accounts` is what makes a slot distinct: the household is found and created
 * by `ownerId`, so a different owner means a wholly separate household with its own copy of every row
 * below. Names repeat across slots on purpose (see `seedAccounts`).
 */
async function seedHousehold(db: SeedDb, accounts: SeedAccounts, label: string) {
  const log = (message: string) => console.log(`▸ ${label}${message}`);

  // 1. User + credential account, created atomically (idempotent by unique email).
  const user = await ensureUser(db, accounts.user, log);
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
        { householdId: created.id, userId: ownerId, name: accounts.user.name, role: 'adult' },
        {
          householdId: created.id,
          name: SEED_CHILD_MEMBER.name,
          nickname: SEED_CHILD_MEMBER.nickname,
          role: 'child',
        },
        { householdId: created.id, name: SEED_PET_MEMBER.name, role: 'pet' },
      ]);

      return created;
    });

    log('seeded preview household with members');
  } else {
    log('preview household already present — skipping');
  }

  if (!household) {
    throw new Error('failed to resolve seed household');
  }

  // 3. Second account user, seeded as a non-owner adult member (idempotent by
  // userId + householdId). Gives the e2e suite a second account-linked member
  // for the owner-only flows (transfer ownership, change a member's role).
  const secondUser = await ensureUser(db, accounts.secondUser, log);
  const [secondMembership] = await db
    .select()
    .from(schema.householdMember)
    .where(and(eq(schema.householdMember.householdId, household.id), eq(schema.householdMember.userId, secondUser.id)));
  if (!secondMembership) {
    await db.insert(schema.householdMember).values({
      householdId: household.id,
      userId: secondUser.id,
      name: accounts.secondUser.name,
      role: 'adult',
    });
    log('seeded second household member');
  } else {
    log('second household member already present — skipping');
  }

  // 3b. Account-linked members for the read-only roles, so the e2e suite can sign in as each and
  // prove what they can and cannot do. Same idempotency as the second adult above.
  for (const [account, role] of [
    [accounts.childUser, 'child'],
    [accounts.externalUser, 'external'],
  ] as const) {
    const user = await ensureUser(db, account, log);
    const [membership] = await db
      .select()
      .from(schema.householdMember)
      .where(and(eq(schema.householdMember.householdId, household.id), eq(schema.householdMember.userId, user.id)));

    if (!membership) {
      await db
        .insert(schema.householdMember)
        .values({ householdId: household.id, userId: user.id, name: account.name, role });
      log(`seeded ${role} household member`);
    } else {
      log(`${role} household member already present — skipping`);
    }
  }

  // 4. Onboarding user — a real account with NO household/membership, so the
  // e2e onboarding spec can create one from a clean slate.
  await ensureUser(db, accounts.onboardingUser, log);

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
    log(`seeded ${inserted.length} stores`);
  } else {
    log('stores already present — skipping');
  }

  // 6. Ingredient library — pantry staples, so the recipe form's picker is never
  // empty (idempotent by household + lower(name), matching the unique index).
  const existingIngredients = await db
    .select()
    .from(schema.ingredient)
    .where(eq(schema.ingredient.householdId, household.id));
  const ingredientIdByName = new Map(existingIngredients.map((row) => [row.name.toLowerCase(), row.id]));
  const missingIngredients = SEED_INGREDIENTS.filter((fixture) => !ingredientIdByName.has(fixture.name.toLowerCase()));

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
    log(`seeded ${inserted.length} ingredients`);
  } else {
    log('ingredients already present — skipping');
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

    log('seeded preview recipe');
  } else {
    log('preview recipe already present — skipping');
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

    log('seeded preview meal plan');
  } else {
    log('preview meal plan already present — skipping');
  }

  // 9. Expense categories, before the expenses that point at them (idempotent by household +
  //    lower(name), matching the unique index).
  const existingCategories = await db
    .select()
    .from(schema.expenseCategory)
    .where(eq(schema.expenseCategory.householdId, household.id));
  const categoryIdByName = new Map(existingCategories.map((row) => [row.name.toLowerCase(), row.id]));
  const missingCategories = SEED_EXPENSE_CATEGORIES.filter(
    (fixture) => !categoryIdByName.has(fixture.name.toLowerCase())
  );

  if (missingCategories.length > 0) {
    const inserted = await db
      .insert(schema.expenseCategory)
      .values(missingCategories.map((fixture) => ({ householdId: household.id, name: fixture.name })))
      .returning();

    for (const row of inserted) {
      categoryIdByName.set(row.name.toLowerCase(), row.id);
    }
    log(`seeded ${inserted.length} expense categories`);
  } else {
    log('expense categories already present — skipping');
  }

  // 10. A few expenses in *this* month, so the page opens on real numbers. Same reasoning as the
  //     meal plan: the default view is the current month, so a literal date would leave it blank
  //     the following month. The day is clamped to the month's length, so a 31 is safe in February.
  const monthStart = startOfMonth(todayISO());
  const daysInMonth = Number(endOfMonth(todayISO()).slice(8));
  const dayFromDayOfMonth = (dayOfMonth: number) => addDays(monthStart, Math.min(dayOfMonth, daysInMonth) - 1);

  const existingExpenses = await db
    .select({ title: schema.expense.title })
    .from(schema.expense)
    .where(eq(schema.expense.householdId, household.id));
  const seededTitles = new Set(existingExpenses.map((row) => row.title));
  const missingExpenses = SEED_EXPENSES.filter((fixture) => !seededTitles.has(fixture.title));

  if (missingExpenses.length > 0) {
    await db.insert(schema.expense).values(
      missingExpenses.map((fixture) => ({
        householdId: household.id,
        title: fixture.title,
        categoryId: fixture.category ? (categoryIdByName.get(fixture.category.toLowerCase()) ?? null) : null,
        amount: fixture.amount,
        currency: household.currency,
        recordedAt: dayFromDayOfMonth(fixture.dayOfMonth),
        paidBackAt: fixture.paidBack ? new Date() : null,
      }))
    );
    log(`seeded ${missingExpenses.length} expenses`);
  } else {
    log('expenses already present — skipping');
  }

  // 11. Storage locations, before the items that live in them (idempotent by household +
  //     lower(name), matching the unique index).
  const existingLocations = await db
    .select()
    .from(schema.storageLocation)
    .where(eq(schema.storageLocation.householdId, household.id));
  const locationIdByName = new Map(existingLocations.map((row) => [row.name.toLowerCase(), row.id]));
  const missingLocations = SEED_STORAGE_LOCATIONS.filter(
    (fixture) => !locationIdByName.has(fixture.name.toLowerCase())
  );

  if (missingLocations.length > 0) {
    const inserted = await db
      .insert(schema.storageLocation)
      .values(
        missingLocations.map((fixture) => ({
          householdId: household.id,
          name: fixture.name,
          address: fixture.address,
          latitude: fixture.latitude,
          longitude: fixture.longitude,
        }))
      )
      .returning();

    for (const row of inserted) {
      locationIdByName.set(row.name.toLowerCase(), row.id);
    }
    log(`seeded ${inserted.length} storage locations`);
  } else {
    log('storage locations already present — skipping');
  }

  // 12. The borrower the seeded loans point at. A loan names a household contact, so this has to
  //     exist before the items do.
  const [existingBorrower] = await db
    .select()
    .from(schema.contact)
    .where(and(eq(schema.contact.householdId, household.id), eq(schema.contact.name, SEED_STORAGE_CONTACT.name)));

  // The month and day come from the offset so the birthday is always still to come. Backdating by
  // a multiple of four keeps a 29 February landing on one.
  const upcoming = addDays(todayISO(), SEED_STORAGE_CONTACT.birthdayOffsetDays);
  const [year, monthDay] = [upcoming.slice(0, 4), upcoming.slice(4)];
  const borrowerDateOfBirth = `${Number(year) - 40}${monthDay}`;

  let borrower = existingBorrower;
  if (!borrower) {
    [borrower] = await db
      .insert(schema.contact)
      .values({
        householdId: household.id,
        name: SEED_STORAGE_CONTACT.name,
        type: SEED_STORAGE_CONTACT.type,
        phone: SEED_STORAGE_CONTACT.phone,
        dateOfBirth: borrowerDateOfBirth,
      })
      .returning();
    log('seeded storage borrower contact');
  } else if (borrower.dateOfBirth === null) {
    // The birthday arrived after this fixture did. Only when still null, so an edit isn't undone.
    await db.update(schema.contact).set({ dateOfBirth: borrowerDateOfBirth }).where(eq(schema.contact.id, borrower.id));
    log('backfilled the storage borrower contact birthday');
  } else {
    log('storage borrower contact already present — skipping');
  }

  if (!borrower) {
    throw new Error('Could not resolve the seeded storage borrower contact');
  }

  // 13. What's in those locations. The loan dates are offsets from today for the same reason the
  //     meal plan's are: a literal date stops being overdue-or-not the moment it passes, which
  //     would leave the overdue filter with nothing to find.
  const existingItems = await db
    .select({ name: schema.storageItem.name })
    .from(schema.storageItem)
    .where(eq(schema.storageItem.householdId, household.id));
  const seededItemNames = new Set(existingItems.map((row) => row.name));
  const missingItems = SEED_STORAGE_ITEMS.filter((fixture) => !seededItemNames.has(fixture.name));

  if (missingItems.length > 0) {
    const today = todayISO();
    await db.insert(schema.storageItem).values(
      missingItems.map((fixture) => {
        const locationId = locationIdByName.get(fixture.location.toLowerCase());

        if (locationId === undefined) {
          throw new Error(`Storage item fixture names an unknown location: ${fixture.location}`);
        }

        return {
          householdId: household.id,
          locationId,
          name: fixture.name,
          notes: fixture.notes,
          quantity: fixture.quantity,
          borrowedByContactId: fixture.loan ? borrower.id : null,
          borrowedByName: fixture.loan ? SEED_STORAGE_CONTACT.name : null,
          borrowedOn: fixture.loan ? addDays(today, fixture.loan.borrowedOffsetDays) : null,
          dueOn: fixture.loan ? addDays(today, fixture.loan.dueOffsetDays) : null,
        };
      })
    );
    log(`seeded ${missingItems.length} storage items`);
  } else {
    log('storage items already present — skipping');
  }

  // 13b. The seeded child's profile, with a doctor attached — the `external` role exists to read
  // exactly this, and an external cannot create one to read.
  const [childMember] = await db
    .select()
    .from(schema.householdMember)
    .where(
      and(eq(schema.householdMember.householdId, household.id), eq(schema.householdMember.name, SEED_CHILD_MEMBER.name))
    );

  if (childMember) {
    const [existingProfile] = await db
      .select()
      .from(schema.childProfile)
      .where(and(eq(schema.childProfile.householdId, household.id), eq(schema.childProfile.memberId, childMember.id)));

    if (!existingProfile) {
      await db.transaction(async (tx) => {
        const [profile] = await tx
          .insert(schema.childProfile)
          .values({ householdId: household.id, memberId: childMember.id, ...SEED_CHILD_PROFILE })
          .returning();

        if (!profile) {
          throw new Error('failed to create seed child profile');
        }

        const [info] = await tx
          .insert(schema.medicalInfo)
          .values({ householdId: household.id, childProfileId: profile.id })
          .returning();
        const [doctor] = await tx
          .insert(schema.contact)
          .values({ householdId: household.id, ...SEED_CHILD_DOCTOR })
          .returning();

        if (!info || !doctor) {
          throw new Error('failed to attach the seed child doctor');
        }

        await tx.insert(schema.medicalInfoContact).values({ medicalInfoId: info.id, contactId: doctor.id });
      });

      log('seeded child profile with a doctor');
    } else {
      log('child profile already present — skipping');
    }
  }

  // 14. The activity feed, last: these are a record of the work above, so they read as its history.
  const existingActivity = await db
    .select({ id: schema.householdActivity.id })
    .from(schema.householdActivity)
    .where(eq(schema.householdActivity.householdId, household.id));

  if (existingActivity.length === 0) {
    const now = Date.now();
    const actorsBySlug = {
      owner: { id: user.id, name: accounts.user.name },
      second: { id: secondUser.id, name: accounts.secondUser.name },
    };

    await db.insert(schema.householdActivity).values(
      // Oldest first: the feed orders by `id`, so a serial has to ascend with time.
      [...SEED_ACTIVITY].reverse().map((fixture) => {
        const actor = actorsBySlug[fixture.actor];
        const lastAt = new Date(now - fixture.hoursAgo * 60 * 60 * 1000);

        return {
          householdId: household.id,
          actorId: actor.id,
          actorName: actor.name,
          entity: fixture.entity,
          operation: fixture.operation,
          entityId: null,
          parentId: null,
          label: fixture.label,
          count: fixture.count,
          changes: fixture.changes.map((change) => ({ ...change })),
          // A run started with the first of its edits; `updatedAt` is the last, and dates the line.
          createdAt: new Date(lastAt.getTime() - (fixture.count - 1) * 10 * 60 * 1000),
          updatedAt: lastAt,
        };
      })
    );
    log(`seeded ${SEED_ACTIVITY.length} activity entries`);
  } else {
    log('activity already present — skipping');
  }
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
 * `SEED_HOUSEHOLD_SLOTS` seeds that many *independent* households, one per set of
 * accounts (see `seedAccounts`). Only the e2e suite sets it — one per Playwright
 * worker, so parallel specs stop mutating each other's rows. It defaults to 1, so
 * a preview or a plain `db:seed` gets exactly the one household it always did.
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

  const slots = Number(process.env.SEED_HOUSEHOLD_SLOTS ?? 1);
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error(`SEED_HOUSEHOLD_SLOTS must be a positive integer, got "${process.env.SEED_HOUSEHOLD_SLOTS}"`);
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

    for (let slot = 0; slot < slots; slot += 1) {
      // Unlabelled when there's only one, so the common case reads as it always has.
      await seedHousehold(db, seedAccounts(slot), slots === 1 ? '' : `w${slot}: `);
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
