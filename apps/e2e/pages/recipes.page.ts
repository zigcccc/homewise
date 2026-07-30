import { expect, type Locator, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/** The recipes list, the create/edit form, and the detail read view. */
export class RecipesPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search recipes or ingredients');
  }

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

  /**
   * Types a name the library doesn't have and adds it through the combobox's create action. The
   * ingredient is *not* persisted here — it travels with the recipe and is created on save.
   */
  async createAndAddIngredient(name: string) {
    await this.page.getByRole('button', { name: 'Add ingredient' }).click();
    await this.page.getByPlaceholder('Search ingredients…').fill(name);
    await this.page.getByRole('button', { name: `Create "${name}"` }).click();
    await expect(this.ingredientRow(name)).toBeVisible();
  }

  /** The editable name input on a not-yet-created ingredient line. */
  newIngredientNameInput(name: string): Locator {
    return this.ingredientRow(name).getByLabel('Ingredient name');
  }

  /** Renames a line that hasn't been persisted yet — only possible before the recipe is saved. */
  async renameNewIngredient(from: string, to: string) {
    await this.newIngredientNameInput(from).fill(to);
    await expect(this.ingredientRow(to)).toBeVisible();
  }

  /** An ingredient line inside the form, identified by its remove button's accessible name. */
  ingredientRow(name: string): Locator {
    return this.page.getByRole('listitem').filter({ has: this.page.getByRole('button', { name: `Remove ${name}` }) });
  }

  /**
   * Every ingredient line in the form, in DOM order — for asserting the order itself. Scoped by
   * testid: tag chips and step rows are list items with "Remove …" buttons too.
   */
  ingredientRows(): Locator {
    return this.page.getByTestId('ingredient-lines').getByRole('listitem');
  }

  /** Every ingredient line on the detail view, in DOM order. */
  detailIngredientRows(): Locator {
    return this.page.getByTestId('recipe-ingredients').getByRole('listitem');
  }

  /**
   * Drags an ingredient line one slot up or down with the keyboard: space lifts it, an arrow moves
   * it a full slot (dnd-kit's sortable keyboard plugin), space drops it. Driven by keyboard rather
   * than by a synthetic mouse drag because it's stable under load *and* it's the accessible path —
   * if this passes, the list is operable without a pointer.
   */
  async moveIngredient(name: string, direction: 'down' | 'up') {
    await this.ingredientRow(name)
      .getByRole('button', { name: `Reorder ${name}` })
      .focus();
    await this.page.keyboard.press('Space');
    await this.page.keyboard.press(direction === 'down' ? 'ArrowDown' : 'ArrowUp');
    await this.page.keyboard.press('Space');
  }

  async setIngredientQuantity(name: string, quantity: string) {
    await this.ingredientRow(name).getByLabel('Quantity').fill(quantity);
  }

  async addStep(instruction: string) {
    await this.page.getByRole('button', { name: 'Add step' }).click();
    const steps = this.page.getByPlaceholder('What happens in this step?');
    await steps.last().fill(instruction);
  }

  /**
   * Commits one or more tags. `fill()` fires an input event, so a comma-separated string is split
   * and committed on the spot; Enter covers the single-tag case, where no comma ever arrives.
   */
  async addTags(input: string) {
    await this.page.getByLabel('Tags').fill(input);
    await this.page.getByLabel('Tags').press('Enter');
  }

  /** A committed tag chip, identified by its remove button. */
  tagChip(name: string): Locator {
    return this.page
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('button', { name: `Remove tag ${name}` }) });
  }

  async save(label: string) {
    await this.page.getByRole('button', { name: label }).click();
  }

  /** The form's Cancel link — a navigation, so it trips the unsaved-changes guard when dirty. */
  async cancelForm() {
    await this.page.getByRole('link', { name: 'Cancel' }).click();
  }

  /** The guard shown when leaving a dirty form. Its title is the dialog's accessible name. */
  unsavedChangesDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Unsaved changes' });
  }

  async stayOnForm() {
    await this.unsavedChangesDialog().getByRole('button', { name: 'Stay' }).click();
    await expect(this.unsavedChangesDialog()).toBeHidden();
  }

  async leaveWithoutSaving() {
    await this.unsavedChangesDialog().getByRole('button', { name: 'Leave without saving' }).click();
    await expect(this.unsavedChangesDialog()).toBeHidden();
  }

  /** Searches the list; the SearchBox waits out the debounce so the next step can't race it. */
  async search(term: string) {
    await this.searchBox.fill(term);
  }

  async filterByMealType(mealType: string) {
    await this.page
      .getByRole('combobox')
      .filter({ hasText: /Any meal|Breakfast|Lunch|Dinner/ })
      .first()
      .click();
    await this.page.getByRole('option', { name: mealType, exact: true }).click();
  }

  /** The sort-direction toggle. Its label follows the sort column, so match any of the four. */
  sortDirectionButton(): Locator {
    return this.page.getByRole('button', { name: /A → Z|Z → A|Oldest first|Newest first/ });
  }

  async toggleSortDirection() {
    await this.sortDirectionButton().click();
  }

  async selectSortKey(label: string) {
    await this.page.getByRole('combobox').filter({ hasText: 'Sort by:' }).click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
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
