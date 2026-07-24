/**
 * Deterministic seed fixtures — the single source of truth for the known data
 * the seed (`seed.ts`) writes and the e2e suite asserts against.
 *
 * Both the seed script and `@homewise/e2e` import from here (the server exposes
 * it via the `./seed-fixtures` package export), so credentials and names can
 * never drift between what's seeded and what the tests expect.
 */

export const SEED_USER = {
  email: 'preview@home-wise.app',
  name: 'Preview User',
  // Deterministic dev credential — previews and the local test DB are throwaway,
  // isolated databases.
  password: 'PreviewPassword123!',
} as const;

export const SEED_HOUSEHOLD_NAME = 'Preview Household';

/** The non-user (managed child) member seeded into the household. */
export const SEED_CHILD_MEMBER = {
  name: 'Robin',
  nickname: 'Robbie',
} as const;
