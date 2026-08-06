import { randomUUID } from 'node:crypto';

import { HTTPException } from 'hono/http-exception';
import { beforeAll, describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { isUniqueViolation } from '#db/utils';
import { StoresService } from '#modules/stores/stores.service';

/**
 * The duplicate-shop defence, against a real Postgres.
 *
 * `create` pre-checks the name and then catches a unique violation anyway, because the gap between
 * those two statements is a TOCTOU window two concurrent creates both walk through. No E2E flow can
 * reach the catch, and a fabricated error can't prove the branch either — what is being asserted is
 * the shape of the error the driver actually raises. That needs a database.
 */

/** A household of this file's own, so it can't collide with another test file's rows. */
async function createHousehold(label: string) {
  const suffix = randomUUID();
  const [owner] = await db
    .insert(schema.user)
    .values({ email: `${label}-${suffix}@example.test`, id: `user-${label}-${suffix}`, name: 'Test Owner' })
    .returning();
  const [household] = await db
    .insert(schema.household)
    .values({ name: `${label} ${suffix}`, ownerId: owner!.id })
    .returning();

  return household!.id;
}

/** Runs an insert and hands back whatever it threw, or null when it succeeded. */
const insertStore = (householdId: number, name: string) =>
  db
    .insert(schema.store)
    .values({ householdId, name })
    .then(() => null)
    .catch((raised: unknown) => raised);

let householdId: number;

beforeAll(async () => {
  householdId = await createHousehold('stores');
});

describe('the unique index behind the defence', () => {
  it('should raise an error that isUniqueViolation recognises, wrapped as drizzle wraps it', async () => {
    // GIVEN: a shop that already exists
    const name = `Duplicate ${randomUUID()}`;
    await insertStore(householdId, name);

    // WHEN: the same name is inserted again
    const error = await insertStore(householdId, name);

    // THEN: the error should be recognised as a duplicate
    expect(error).not.toBeNull();
    expect(isUniqueViolation(error)).toBe(true);

    // THEN: and the code should sit on the cause rather than the wrapper — which is exactly why the
    // check has to walk `cause`, and what the hand-built chains in `db/utils.test.ts` stand in for
    expect(error).not.toHaveProperty('code');
    expect(error).toHaveProperty('cause.code', '23505');
  });

  it('should deduplicate case-insensitively', async () => {
    // GIVEN: a shop that already exists
    const name = `Spar ${randomUUID()}`;
    await insertStore(householdId, name);

    // WHEN: the same name is inserted in a different case
    const error = await insertStore(householdId, name.toUpperCase());

    // THEN: it should still collide — two "Spar" rows would split one shop's items across two
    // sections of the same list
    expect(isUniqueViolation(error)).toBe(true);
  });

  it('should scope the constraint to one household', async () => {
    // GIVEN: a shop name already used by this household, and a second household
    const otherHouseholdId = await createHousehold('other');
    const name = `Shared ${randomUUID()}`;
    await insertStore(householdId, name);

    // WHEN: the other household uses the same name
    // THEN: it should be allowed
    expect(await insertStore(otherHouseholdId, name)).toBeNull();
  });
});

describe('StoresService.create', () => {
  it('should answer 409 rather than 500 when two creates of the same name race', async () => {
    // GIVEN: two creates of the same new name, both clearing the pre-check before either insert lands
    const name = `Race ${randomUUID()}`;

    // WHEN: they run concurrently
    const [first, second] = await Promise.allSettled([
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
    ]);

    // THEN: exactly one should win
    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    const rejected = [first, second].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // THEN: and the loser should be told the shop already exists, not handed a 500
    const error: unknown = rejected[0]?.reason;

    if (!(error instanceof HTTPException)) {
      throw new Error(`Expected the losing create to be refused with an HTTPException, got ${String(error)}`);
    }

    expect(error.status).toBe(409);
    expect(error.message).toContain(name);
  });

  it('should leave exactly one row behind after a race', async () => {
    // GIVEN: three creates of the same new name
    const name = `Race rows ${randomUUID()}`;

    // WHEN: they run concurrently
    await Promise.allSettled([
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
    ]);

    // THEN: the household should hold one shop by that name
    const rows = await db.query.store.findMany({ where: (store, { eq }) => eq(store.name, name) });

    expect(rows).toHaveLength(1);
  });
});
