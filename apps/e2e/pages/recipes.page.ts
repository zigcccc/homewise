import { expect, type Locator, type Page } from '@playwright/test';

/** The recipes list, the create/edit form, and the detail read view. */
export class RecipesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/food/recipes');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Recipes' })).toBeVisible();
  }

  /** A recipe's card in the list. Cards are links, so the title is the accessible name. */
  card(title: string): Locator {
    return this.page.getByRole('link').filter({ hasText: title });
  }

  async openNewForm() {
    await this.page.getByRole('link', { name: 'Add recipe' }).first().click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Add a recipe' })).toBeVisible();
  }

  async open(title: string) {
    await this.card(title).first().click();
    await expect(this.page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }

  /**
   * Opens the edit form and waits for it to actually mount. The route has a loader and a Spinner
   * pending state, so typing straight after the click can land before the form seeds its values.
   */
  async openEditForm() {
    // `exact` matters: the breadcrumb renders the recipe title as a role=link, so a substring
    // match would collide with any title containing the word "Edit".
    await this.page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  }

  async fillTitle(title: string) {
    await this.page.getByLabel('Title').fill(title);
  }

  /** Best-effort cleanup: removes the recipe when it's in the list, and says so. */
  async deleteIfPresent(title: string): Promise<boolean> {
    if ((await this.card(title).count()) === 0) {
      return false;
    }

    await this.open(title);
    await this.delete();
    await this.goto();

    return true;
  }

  async fillNumber(label: string, value: string) {
    await this.page.getByLabel(label).fill(value);
  }

  async selectMealType(mealType: string) {
    await this.page.getByLabel('Meal type').click();
    await this.page.getByRole('option', { name: mealType, exact: true }).click();
  }

  /** Picks an existing library ingredient through the combobox. */
  async addExistingIngredient(name: string) {
    await this.page.getByRole('button', { name: 'Add ingredient' }).click();
    await this.page.getByPlaceholder('Search ingredients…').fill(name);
    await this.page.getByRole('option').filter({ hasText: name }).first().click();
    await expect(this.ingredientRow(name)).toBeVisible();
  }

  /** Types a name the library doesn't have and mints it through the combobox's create action. */
  async createAndAddIngredient(name: string) {
    await this.page.getByRole('button', { name: 'Add ingredient' }).click();
    await this.page.getByPlaceholder('Search ingredients…').fill(name);
    await this.page.getByRole('button', { name: `Create "${name}"` }).click();
    await expect(this.ingredientRow(name)).toBeVisible();
  }

  /** An ingredient line inside the form, identified by its remove button's accessible name. */
  ingredientRow(name: string): Locator {
    return this.page.getByRole('listitem').filter({ has: this.page.getByRole('button', { name: `Remove ${name}` }) });
  }

  async setIngredientQuantity(name: string, quantity: string) {
    await this.ingredientRow(name).getByLabel('Quantity').fill(quantity);
  }

  async addStep(instruction: string) {
    await this.page.getByRole('button', { name: 'Add step' }).click();
    const steps = this.page.getByPlaceholder('What happens in this step?');
    await steps.last().fill(instruction);
  }

  async addTag(name: string) {
    await this.page.getByLabel('Add tag').fill(name);
    await this.page.getByRole('button', { name: 'Add tag' }).click();
  }

  async save(label: string) {
    await this.page.getByRole('button', { name: label }).click();
  }

  /**
   * The input debounces before navigating, so acting immediately after `fill()` can hit the table
   * mid-rerender. Wait for the URL to carry the term, matching dictionary/ingredients.
   */
  async search(term: string) {
    await this.page.getByPlaceholder('Search recipes or ingredients').fill(term);
    await this.page.waitForURL((url) =>
      term === '' ? !url.searchParams.has('search') : url.searchParams.get('search') === term
    );
  }

  async filterByMealType(mealType: string) {
    await this.page
      .getByRole('combobox')
      .filter({ hasText: /Any meal|Breakfast|Lunch|Dinner/ })
      .first()
      .click();
    await this.page.getByRole('option', { name: mealType, exact: true }).click();
  }

  async openActionsMenu() {
    await this.page.getByRole('button', { name: 'Recipe actions' }).click();
  }

  async toggleFavorite() {
    await this.openActionsMenu();
    await this.page.getByRole('menuitem', { name: /favorites/ }).click();
  }

  async archive() {
    await this.openActionsMenu();
    await this.page.getByRole('menuitem', { name: 'Archive recipe' }).click();
  }

  async restore() {
    await this.openActionsMenu();
    await this.page.getByRole('menuitem', { name: 'Restore recipe' }).click();
  }

  async delete() {
    await this.openActionsMenu();
    await this.page.getByRole('menuitem', { name: 'Delete recipe' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete recipe' }).click();
    await expect(dialog).toBeHidden();
  }

  async toggleShowArchived() {
    await this.page.getByLabel('Show archived').click();
  }

  async toggleFavoritesFilter() {
    await this.page.getByLabel('Favorites').click();
  }

  async setServings(direction: 'more' | 'fewer') {
    await this.page.getByRole('button', { name: direction === 'more' ? 'More servings' : 'Fewer servings' }).click();
  }

  servings(): Locator {
    return this.page.getByTestId('servings');
  }

  /**
   * Detail-view assertions are scoped to their card: a success toast carries the same ingredient
   * name, so an unscoped `getByText` is ambiguous the moment one is on screen.
   */
  detailIngredient(name: string): Locator {
    return this.page.getByTestId('recipe-ingredients').getByText(name);
  }

  detailStep(instruction: string): Locator {
    return this.page.getByTestId('recipe-steps').getByText(instruction);
  }
}
