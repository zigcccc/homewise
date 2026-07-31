import { expect, test } from '@playwright/test';

import { DashboardPage } from '../pages/dashboard.page';
import { API_URL } from '../playwright.config';

/**
 * Two properties of the Sentry integration that nothing else would notice breaking.
 */
test.describe('sentry', () => {
  /**
   * Both apps read their DSN from the environment, and the E2E suite deliberately sets neither — so
   * a test run must never reach Sentry. What this actually catches is a DSN written into a source
   * file instead: that would quietly bill every CI run to the production project and bury real
   * issues under events from seeded data.
   */
  test('sends nothing to Sentry when no DSN is configured', async ({ page }) => {
    const ingestRequests: string[] = [];
    page.on('request', (request) => {
      if (/ingest\..*sentry\.io/.test(request.url())) {
        ingestRequests.push(request.url());
      }
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    // A page load transaction would be sent on idle, not on navigation — give it time to surface
    // rather than asserting on an empty beat.
    await page.waitForTimeout(2000);

    expect(ingestRequests, 'a test run sent events to Sentry').toEqual([]);
  });

  /**
   * The browser links a page load to the API calls it made by sending `sentry-trace` and `baggage`
   * on cross-origin requests, which the server has to allow through CORS. Drop them from
   * `allowHeaders` and nothing looks broken — both projects still report, the traces just stop
   * joining up, which no other test and no amount of clicking would reveal.
   *
   * Asserted against a preflight rather than a real page load because the suite runs with Sentry
   * disabled, so no browser request here ever carries the headers.
   */
  test('the API preflight allows the distributed-tracing headers', async ({ request }) => {
    const response = await request.fetch(`${API_URL}/users/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'sentry-trace,baggage',
      },
    });

    const allowed = (response.headers()['access-control-allow-headers'] ?? '').toLowerCase();

    expect(allowed).toContain('sentry-trace');
    expect(allowed).toContain('baggage');
  });
});
