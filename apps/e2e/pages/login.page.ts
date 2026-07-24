import { type Locator, type Page } from '@playwright/test';

/** The email/password login screen (`/login`). */
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    // exact, so "Email" doesn't also match the router devtools' "…/verify-email"
    // match-details control (substring match would make this flaky).
    this.emailInput = page.getByLabel('Email', { exact: true });
    this.passwordInput = page.getByLabel('Password', { exact: true });
    // exact, so it doesn't also match the disabled "Login with Google" button.
    this.submitButton = page.getByRole('button', { name: 'Login', exact: true });
  }

  async goto() {
    await this.page.goto('/login');
  }

  /** Fills the form and submits, without waiting for any particular destination. */
  async fillCredentials(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Signs in and waits for the redirect to the authenticated dashboard (`/`). */
  async login(email: string, password: string) {
    await this.fillCredentials(email, password);
    await this.page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  }
}
