import { type Page } from '@playwright/test';

/** The app shell chrome — the sidebar navigation, the account menu and its actions. */
export class AppNav {
  constructor(private readonly page: Page) {}

  /** The sidebar root. At desktop widths only one element carries this slot. */
  sidebar() {
    return this.page.locator('[data-slot="sidebar"]');
  }

  /**
   * A sidebar navigation entry. It is the anchor itself that carries `data-active` — the kit's
   * `SidebarMenuButton` stamps it onto whatever it renders, and here that is the `<Link>`.
   */
  navLink(name: string) {
    return this.sidebar().getByRole('link', { exact: true, name });
  }

  /**
   * Waits until this tab is actually subscribed.
   *
   * An observer that has rendered is not yet listening — the socket opens when the realtime provider
   * mounts, then a token is fetched, then the channel attaches, and anything published before that
   * lands is simply missed. A spec whose *other* context acts the moment the first has loaded is
   * racing all three, which is what used to make the cross-member specs flaky.
   */
  async waitForRealtime() {
    await this.page.locator('[data-realtime="attached"]').waitFor({ state: 'attached' });
  }

  /** Nested interactive elements. Anything but zero is the bug this guards against. */
  nestedButtons() {
    return this.sidebar().locator('a button');
  }

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
