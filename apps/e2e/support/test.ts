import fs from 'node:fs';
import path from 'node:path';

import { type Browser, test as base } from '@playwright/test';

import { seedAccounts } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';

/**
 * The suite's own `test`, and the reason specs can run `fullyParallel` against real, mutable data.
 *
 * **Every worker gets its own household.** `globalSetup` seeds one per worker (`config.workers` of
 * them), and `parallelIndex` picks which — so a spec can create, rename and delete whatever it likes
 * without another spec watching those rows. This is Playwright's own "one account per parallel
 * worker" pattern (https://playwright.dev/docs/auth).
 *
 * It replaced a single shared seeded household, under which a full run failed roughly three times in
 * four: a different spec each time, always green in isolation, because three workers were mutating
 * one household's rows. Import `test` and `expect` from here, never from `@playwright/test` — a spec
 * that imports the base `test` gets no session at all.
 *
 * Only the accounts' **emails** differ between households. Every name — the user, the second member,
 * the child, the household, the recipe, the ingredients — is identical in all of them, because it is
 * household-scoped in the database. So `SEED_*` fixtures stay directly assertable from any spec.
 */
export * from '@playwright/test';

/** Which of a household's three seeded accounts a test runs as. */
export type Session = 'owner' | 'second' | 'onboarding';

type SeedAccounts = ReturnType<typeof seedAccounts>;

const ACCOUNT_KEY = {
  owner: 'user',
  second: 'secondUser',
  onboarding: 'onboardingUser',
} satisfies Record<Session, keyof SeedAccounts>;

type Options = {
  /**
   * Whose session the test's page starts with. `none` starts signed out, for the specs that drive
   * the login screen itself.
   */
  sessionAs: Session | 'none';
};

type Household = {
  /** This worker's household's three accounts. Their emails are what make the household its own. */
  accounts: SeedAccounts;
  /**
   * A logged-in session for one of them, as a `storageState` path.
   *
   * Resolved on demand and memoised for the worker's lifetime: most tests only ever need `owner`, so
   * they pay one login rather than three. Specs that need a second live session — a member watching
   * another member act — call this directly and hand the path to `browser.newContext`.
   */
  sessionFor: (who: Session) => Promise<string>;
};

export const test = base.extend<Options, { household: Household }>({
  sessionAs: ['owner', { option: true }],

  household: [
    async ({ browser }, use) => {
      const accounts = seedAccounts(test.info().parallelIndex);
      const sessions = new Map<Session, Promise<string>>();

      await use({
        accounts,
        // Memoise the promise, not the path: two fixtures asking at once would both log in otherwise.
        sessionFor: (who) => {
          const pending = sessions.get(who) ?? authenticate(browser, accounts, who);
          sessions.set(who, pending);

          return pending;
        },
      });
    },
    { scope: 'worker' },
  ],

  storageState: async ({ household, sessionAs }, use) => {
    await use(sessionAs === 'none' ? { cookies: [], origins: [] } : await household.sessionFor(sessionAs));
  },
});

/**
 * Signs one account in and saves its session.
 *
 * The file lives under the project's `outputDir`, which Playwright empties at the start of every
 * run. That matters: the seed re-creates its users each run with fresh ids, so a session kept
 * anywhere more permanent would authenticate as a user that no longer exists — and the failure would
 * land on whichever spec happened to run first. A file already present means this worker was
 * restarted mid-run, and its session is still good.
 */
async function authenticate(browser: Browser, accounts: SeedAccounts, who: Session) {
  const slot = test.info().parallelIndex;
  const file = path.join(test.info().project.outputDir, '.auth', `w${slot}-${who}.json`);

  if (fs.existsSync(file)) {
    return file;
  }

  const account = accounts[ACCOUNT_KEY[who]];
  // `baseURL` explicitly: it's applied by the `page` fixture, not by the browser, so a page opened
  // straight off `browser` has none and every relative goto fails as an invalid URL.
  const page = await browser.newPage({ baseURL: test.info().project.use.baseURL, storageState: undefined });
  const login = new LoginPage(page);

  try {
    await login.goto();

    if (who === 'onboarding') {
      // This one has no household, so the onboarded guard sends it into the onboarding flow, not `/`.
      await login.fillCredentials(account.email, account.password);
      await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
    } else {
      await login.login(account.email, account.password);
      // Confirm the session actually works before persisting it — a saved-but-dead session turns
      // into an unexplained redirect in whichever spec picks it up.
      await new DashboardPage(page).expectLoaded({ userName: account.name });
    }

    await page.context().storageState({ path: file });
  } finally {
    await page.close();
  }

  return file;
}
