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
 * reach the catch — a user would have to submit the same new name twice within one round trip — and
 * a fabricated error object can't prove the branch works either, because the thing being asserted is
 * the *shape of the error the driver actually raises*. That needs a database.
 */

let householdId: number;

beforeAll(async () => {
  // Its own household, so this file can't collide with another test file's rows.
  const suffix = randomUUID();
  const [owner] = await db
    .insert(schema.user)
    .values({ email: `stores-${suffix}@example.test`, id: `user-${suffix}`, name: 'Stores Test Owner' })
    .returning();
  const [household] = await db
    .insert(schema.household)
    .values({ name: `Stores Test ${suffix}`, ownerId: owner!.id })
    .returning();

  householdId = household!.id;
});

describe('the unique index behind the defence', () => {
  it('raises an error that isUniqueViolation recognises, wrapped as drizzle wraps it', async () => {
    // What the hand-built cause chains in `db/utils.test.ts` are standing in for. If drizzle ever
    // stops wrapping, or wraps differently, this is what notices.
    const values = { householdId, name: `Duplicate ${randomUUID()}` };
    await db.insert(schema.store).values(values);

    const error = await db
      .insert(schema.store)
      .values(values)
      .then(() => null)
      .catch((raised: unknown) => raised);

    expect(error).not.toBeNull();
    expect(isUniqueViolation(error)).toBe(true);
    // The wrapper carries no code of its own — which is exactly why the check has to walk `cause`.
    expect(error).not.toHaveProperty('code');
    expect(error).toHaveProperty('cause.code', '23505');
  });

  it('deduplicates case-insensitively', async () => {
    // Two "Spar" rows would split one shop's items across two sections of the same list.
    const name = `Spar ${randomUUID()}`;
    await db.insert(schema.store).values({ householdId, name });

    const error = await db
      .insert(schema.store)
      .values({ householdId, name: name.toUpperCase() })
      .then(() => null)
      .catch((raised: unknown) => raised);

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('scopes the constraint to one household', async () => {
    // Another household using the same shop name is not a conflict.
    const suffix = randomUUID();
    const [owner] = await db
      .insert(schema.user)
      .values({ email: `other-${suffix}@example.test`, id: `user-other-${suffix}`, name: 'Other Owner' })
      .returning();
    const [other] = await db
      .insert(schema.household)
      .values({ name: `Other ${suffix}`, ownerId: owner!.id })
      .returning();
    const name = `Shared ${suffix}`;

    await db.insert(schema.store).values({ householdId, name });

    await expect(db.insert(schema.store).values({ householdId: other!.id, name })).resolves.toBeDefined();
  });
});

describe('StoresService.create', () => {
  it('answers 409 rather than 500 when two creates of the same name race', async () => {
    // Both calls clear the pre-check before either insert lands, so one of them reaches the catch.
    // Whichever path answers, the contract is the same: one shop exists, and the loser was told it
    // already exists instead of being handed a 500.
    const name = `Race ${randomUUID()}`;

    const [first, second] = await Promise.allSettled([
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
    ]);

    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    const rejected = [first, second].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error: unknown = rejected[0]?.reason;

    if (!(error instanceof HTTPException)) {
      throw new Error(`Expected the losing create to be refused with an HTTPException, got ${String(error)}`);
    }

    expect(error.status).toBe(409);
    expect(error.message).toContain(name);
  });

  it('leaves exactly one row behind after a race', async () => {
    const name = `Race rows ${randomUUID()}`;

    await Promise.allSettled([
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
      StoresService.create(householdId, { name }),
    ]);

    const rows = await db.query.store.findMany({ where: (store, { eq }) => eq(store.name, name) });

    expect(rows).toHaveLength(1);
  });
});
