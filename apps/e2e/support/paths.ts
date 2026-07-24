import path from 'node:path';

/**
 * Where the authenticated session (storageState) produced by the `setup` project
 * is written and read from. Shared by playwright.config.ts (which points the
 * `chromium` project at it) and auth.setup.ts (which writes it), so the path can
 * never drift. Git-ignored (see .gitignore).
 */
export const STORAGE_STATE = path.resolve(import.meta.dirname, '..', '.auth', 'user.json');
