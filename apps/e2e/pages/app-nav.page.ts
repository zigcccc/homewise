import { type Page } from '@playwright/test';

/** The app shell chrome — the sidebar account menu and its actions. */
export class AppNav {
  constructor(private readonly page: Page) {}

  /**
   * Opens the sidebar-footer account menu and signs out, waiting for the
   * redirect to `/login`. The footer button is the only one whose accessible
   * name carries the signed-in user's email, so `@` uniquely identifies it.
   */
  async signOut() {
    await this.page.getByRole('button', { name: /@/ }).click();
    await this.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await this.page.waitForURL(/\/login/, { timeout: 15_000 });
  }
}
