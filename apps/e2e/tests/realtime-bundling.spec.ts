import { expect, test } from '@playwright/test';

/**
 * The Ably client is constructed at module scope, so *when its module is evaluated* decides when a
 * tab starts trying to open a connection. That's a property of the import graph — invisible in
 * review and easy to undo: re-export the provider from `modules/realtime`'s barrel and it joins the
 * main bundle, because `_onboarded`'s `beforeLoad` imports that barrel for the channel query. Every
 * signed-out visitor would then load the SDK and hammer a token endpoint that can only 401.
 *
 * Asserting on `POST /realtime/auth` rather than on a websocket: `authCallback` runs the instant the
 * client is constructed, so the token request is the first and most reliable evidence it exists. The
 * websocket never opens when that request 401s, and production chunk names are hashed, so neither
 * makes a usable signal.
 */
test.describe('realtime bundling', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('does not construct the Ably client for a signed-out visitor', async ({ page }) => {
    const tokenRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/realtime/auth')) {
        tokenRequests.push(request.url());
      }
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    // Give a stray construction time to surface rather than asserting on an empty beat.
    await page.waitForTimeout(2000);

    expect(tokenRequests, 'a signed-out page asked for a realtime token').toEqual([]);
  });
});
