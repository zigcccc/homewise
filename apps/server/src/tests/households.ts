import { randomUUID } from 'node:crypto';

import { db, schema } from '#db/core';

/**
 * A household of the caller's own, owned by a fresh user.
 *
 * The unit DB is never seeded and test files run in parallel, so every row a test needs it builds
 * itself — the `randomUUID()` suffix is what keeps two files from colliding on a name or an email.
 */
export async function createHousehold(label: string) {
  const suffix = randomUUID();

  const [owner] = await db
    .insert(schema.user)
    .values({ email: `${label}-${suffix}@example.test`, id: `user-${label}-${suffix}`, name: 'Test Owner' })
    .returning();

  const [household] = await db
    .insert(schema.household)
    .values({ name: `${label} ${suffix}`, ownerId: owner!.id })
    .returning();

  return { householdId: household!.id, userId: owner!.id };
}
