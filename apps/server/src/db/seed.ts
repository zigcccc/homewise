import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Idempotent seed for preview databases.
 *
 * Each Vercel preview deploy runs against its own fresh Neon branch, so this
 * script establishes a known, deterministic starting state (a verified user
 * that can log in, one household, a couple of members). It is safe to re-run:
 * every step checks for existing data first, so redeploys never duplicate rows
 * or error out. This is also the fixture future e2e tests will rely on.
 *
 * Run via `pnpm db:seed`. DATABASE_URL is provided by the caller (the guarded
 * preview build points it at the unpooled/direct Neon endpoint).
 */

const SEED_USER = {
  email: 'preview@home-wise.app',
  name: 'Preview User',
  // Deterministic dev credential — previews are throwaway, isolated branches.
  password: 'PreviewPassword123!',
} as const;

const SEED_HOUSEHOLD_NAME = 'Preview Household';

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    // 0. Optional reset (previews only). Neon branches previews off production,
    // so the branch starts as a copy-on-write clone of prod data. When SEED_RESET
    // is set (the guarded preview build sets it), wipe all data first so the
    // preview DB is empty-then-seeded and deterministic. Only ever operates on
    // an isolated preview branch — never production (guarded below), and prod is
    // never seeded anyway. The schema and drizzle migration journal are left
    // intact (the journal lives in the `drizzle` schema, not `public`).
    if (process.env.SEED_RESET === 'true') {
      if (process.env.VERCEL_ENV === 'production') {
        throw new Error('refusing to reset: SEED_RESET must never run against production');
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

    // 1. User + credential account (idempotent by unique email).
    let [user] = await db.select().from(schema.user).where(eq(schema.user.email, SEED_USER.email));

    if (!user) {
      const userId = randomUUID();
      [user] = await db
        .insert(schema.user)
        .values({
          id: userId,
          name: SEED_USER.name,
          email: SEED_USER.email,
          emailVerified: true,
          role: 'user',
        })
        .returning();

      // Hash with better-auth's own hasher so the seeded user can actually log in.
      const hashedPassword = await hashPassword(SEED_USER.password);

      await db.insert(schema.account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashedPassword,
      });

      console.log(`▸ seeded user ${SEED_USER.email}`);
    } else {
      console.log(`▸ user ${SEED_USER.email} already present — skipping`);
    }

    if (!user) {
      throw new Error('failed to resolve seed user');
    }

    // 2. Household owned by the seed user, with members (idempotent by owner).
    let [household] = await db.select().from(schema.household).where(eq(schema.household.ownerId, user.id));

    if (!household) {
      [household] = await db
        .insert(schema.household)
        .values({ name: SEED_HOUSEHOLD_NAME, ownerId: user.id })
        .returning();

      if (!household) {
        throw new Error('failed to create seed household');
      }

      await db.insert(schema.householdMember).values([
        { householdId: household.id, userId: user.id, name: SEED_USER.name, role: 'adult' },
        { householdId: household.id, name: 'Robin', nickname: 'Robbie', role: 'child' },
      ]);

      console.log(`▸ seeded household "${SEED_HOUSEHOLD_NAME}" with members`);
    } else {
      console.log(`▸ household for ${SEED_USER.email} already present — skipping`);
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
