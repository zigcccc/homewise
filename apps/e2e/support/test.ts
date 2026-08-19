import fs from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, type Browser, test as base } from '@playwright/test';

import { seedAccounts } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { ExternalHomePage } from '../pages/external-home.page';
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
export type Session = 'owner' | 'second' | 'child' | 'external' | 'onboarding';

type SeedAccounts = ReturnType<typeof seedAccounts>;

const ACCOUNT_KEY = {
  owner: 'user',
  second: 'secondUser',
  child: 'childUser',
  external: 'externalUser',
  onboarding: 'onboardingUser',
} satisfies Record<Session, keyof SeedAccounts>;

type Options = {
  /**
   * Whose session the test's page starts with. `none` starts signed out, for the specs that drive
   * the login screen itself.
   */
  sessionAs: Session | 'none';
};

type Cleanup = {
  /**
   * Registers teardown for a row this test created. Runs after the test whatever became of it —
   * passed, failed, or timed out.
   *
   * The last one matters most. A test that overruns its budget has its page closed mid-flight, so a
   * `finally` block that drives the UI never reaches its first click; the row survives, and the
   * retry inherits a household the previous attempt was halfway through changing. This runs in
   * fixture teardown against a fresh `APIRequestContext`, which owes the dead page nothing.
   *
   * Use it for rows whose only purpose is to exist. Where deleting *through the UI* is the thing
   * under test, that stays in the test body where it can be asserted on.
   */
  add(job: (api: APIRequestContext) => Promise<void>): void;
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

export const test = base.extend<Options & { cleanup: Cleanup }, { household: Household }>({
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

  /**
   * Records what the browser saw, and attaches it to the test if it fails.
   *
   * A timeout otherwise reports only where Playwright gave up waiting — which, when the app has hit
   * its root error boundary, is every later step in the spec and none of the reason. The page errors,
   * the console, and any 4xx/5xx are what say which loader rejected.
   *
   * An override rather than an `auto` fixture, so a test that never opens a page still doesn't.
   */
  page: async ({ page }, use, testInfo) => {
    const log: string[] = [];
    // Capped, so a page erroring in a render loop can't turn the attachment into a megabyte.
    const record = (line: string) => {
      if (log.length < 200) {
        log.push(`${new Date().toISOString().slice(11, 23)}  ${line}`);
      }
    };

    page.on('pageerror', (error) => record(`pageerror       ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        record(`console.${message.type().padEnd(7)} ${message.text()}`);
      }
    });
    page.on('requestfailed', (request) => {
      record(`requestfailed   ${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        record(`HTTP ${response.status()}        ${response.request().method()} ${response.url()}`);
      }
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus && log.length > 0) {
      await testInfo.attach('browser.log', { body: log.join('\n'), contentType: 'text/plain' });
    }
  },

  cleanup: async ({ household, playwright, sessionAs }, use) => {
    const jobs: ((api: APIRequestContext) => Promise<void>)[] = [];

    await use({
      add: (job) => {
        jobs.push(job);
      },
    });

    if (jobs.length === 0) {
      return;
    }

    // As whoever the test ran as, so a spec acting for a different member cleans up in the household
    // it actually wrote to. A signed-out spec has no session of its own, and the owner's will do.
    const api = await playwright.request.newContext({
      storageState: await household.sessionFor(sessionAs === 'none' ? 'owner' : sessionAs),
    });
    const failures: string[] = [];

    try {
      // Reverse order, so a row that depends on an earlier one goes first. Each job is attempted
      // whatever the one before it did: the point of this fixture is that nothing is left behind,
      // and one refused delete must not skip the rest.
      for (const job of jobs.reverse()) {
        try {
          await job(api);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      await api.dispose();
    }

    if (failures.length > 0) {
      // Playwright reports a teardown error alongside the test's own, so this can't hide a failure —
      // and a silent 4xx here looks exactly like a clean pass.
      throw new Error(`Cleanup left rows behind:\n${failures.map((message) => `  - ${message}`).join('\n')}`);
    }
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
    } else if (who === 'external') {
      // An external's home is `/external`, not the dashboard — the shell redirects them off `/`.
      await login.fillCredentials(account.email, account.password);
      await page.waitForURL(/\/external/, { timeout: 15_000 });
      await new ExternalHomePage(page).expectLoaded({ userName: account.name });
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
