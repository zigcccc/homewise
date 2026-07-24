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
 * every step checks for existing data first, and each fixture is created inside
 * a transaction, so redeploys never duplicate rows, leave partial state, or
 * error out. This is also the fixture future e2e tests will rely on.
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
    // preview DB is empty-then-seeded and deterministic. Allowed ONLY in Vercel's
    // preview environment — an unset/other VERCEL_ENV is rejected so a prod (or
    // local) DATABASE_URL can never be truncated. The schema and drizzle migration
    // journal are left intact (the journal lives in the `drizzle` schema).
    if (process.env.SEED_RESET === 'true') {
      // Destructive. Require BOTH that we're actually executing inside a Vercel
      // build (VERCEL=1, which a local shell never has) AND VERCEL_ENV=preview.
      // VERCEL_ENV alone is caller-controlled and not tied to which DB
      // DATABASE_URL points at; demanding VERCEL=1 blocks the realistic footgun
      // of running SEED_RESET locally against a prod/staging URL.
      if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview') {
        throw new Error(
          'refusing to reset: SEED_RESET requires a Vercel preview build (VERCEL=1 and VERCEL_ENV=preview)'
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
    let [user] = await db.select().from(schema.user).where(eq(schema.user.email, SEED_USER.email));

    if (!user) {
      const userId = randomUUID();
      // Hash with better-auth's own hasher so the seeded user can actually log in.
      const hashedPassword = await hashPassword(SEED_USER.password);

      // Wrap in a transaction so a failure can't leave a user without its
      // credential account (which a later rerun would then skip over).
      user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.user)
          .values({
            id: userId,
            name: SEED_USER.name,
            email: SEED_USER.email,
            emailVerified: true,
            role: 'user',
          })
          .returning();

        await tx.insert(schema.account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: hashedPassword,
        });

        return created;
      });

      console.log('▸ seeded preview user');
    } else {
      console.log('▸ preview user already present — skipping');
    }

    if (!user) {
      throw new Error('failed to resolve seed user');
    }
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
          { householdId: created.id, name: 'Robin', nickname: 'Robbie', role: 'child' },
        ]);

        return created;
      });

      console.log('▸ seeded preview household with members');
    } else {
      console.log('▸ preview household already present — skipping');
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
