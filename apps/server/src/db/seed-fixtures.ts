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

/**
 * A second real account user, seeded as a non-owner `adult` member of the seed
 * household. The e2e suite needs a second account-linked member to exercise the
 * owner-only flows that a single account can't reach on its own — transferring
 * ownership and changing an account member's role.
 */
export const SEED_SECOND_USER = {
  email: 'preview.second@home-wise.app',
  name: 'Second User',
  password: 'PreviewPassword123!',
} as const;

/**
 * A real account user seeded with NO household and NO membership, so the e2e
 * suite can drive the onboarding flow (create-household) from a clean slate.
 * The onboarding spec owns this user's household state end-to-end (creates then
 * deletes), so reruns start clean.
 */
export const SEED_ONBOARDING_USER = {
  email: 'preview.onboarding@home-wise.app',
  name: 'Onboarding User',
  password: 'PreviewPassword123!',
} as const;

/** The non-user (managed child) member seeded into the household. */
export const SEED_CHILD_MEMBER = {
  name: 'Robin',
  nickname: 'Robbie',
} as const;
