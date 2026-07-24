import { type Locator, type Page } from '@playwright/test';

/** The email/password login screen (`/login`). */
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    // exact, so it doesn't also match the disabled "Login with Google" button.
    this.submitButton = page.getByRole('button', { name: 'Login', exact: true });
  }

  async goto() {
    await this.page.goto('/login');
  }

  /** Signs in and waits for the redirect to the authenticated dashboard (`/`). */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  }
}
