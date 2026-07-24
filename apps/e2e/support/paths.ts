import path from 'node:path';

/**
 * Where the authenticated session (storageState) produced by the `setup` project
 * is written and read from. Shared by playwright.config.ts (which points the
 * `chromium` project at it) and auth.setup.ts (which writes it), so the path can
 * never drift. Git-ignored (see .gitignore).
 */
export const STORAGE_STATE = path.resolve(import.meta.dirname, '..', '.auth', 'user.json');

/**
 * Session for the second seeded account member (`SEED_SECOND_USER`). Specs that
 * need to act as a non-owner member — or hold a second live session, as the
 * ownership round-trip does — load this via `test.use({ storageState })`.
 */
export const SECOND_USER_STORAGE_STATE = path.resolve(import.meta.dirname, '..', '.auth', 'second-user.json');

/**
 * Session for the household-less onboarding user (`SEED_ONBOARDING_USER`), used
 * only by the onboarding spec.
 */
export const ONBOARDING_STORAGE_STATE = path.resolve(import.meta.dirname, '..', '.auth', 'onboarding-user.json');
