import { expect, type Locator, type Page } from '@playwright/test';

import { Drag } from './drag';

/**
 * The weekly meal plan.
 *
 * Everything on this page edits in place, so there is no dialog surface here at all. Editors are
 * located by `aria-label` and scoped to the card or day they belong to — several cards carry
 * identically-shaped controls, and an unscoped role query would match whichever rendered first.
 *
 * Every method takes an ISO day, and `goto` takes the Monday to open on. That's how specs stay
 * isolated under `fullyParallel` against a single shared household: each one owns a distinct
 * far-future week reached straight through the URL, so no two specs — and no human — ever touch the
 * same days.
 */
export class MealPlanPage {
  private readonly drag: Drag;

  constructor(private readonly page: Page) {
    this.drag = new Drag(page);
  }

  async goto(from?: string) {
    await this.page.goto(from ? `/food/meal-plan?from=${from}` : '/food/meal-plan');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Meal plan' })).toBeVisible();
  }

  /** A day card. Keyed by date, which no role or label query can address. */
  dayRow(day: string): Locator {
    return this.page.getByTestId(`meal-plan-day-${day}`);
  }

  /** The header above a week's group of day cards. */
  weekHeader(text: string): Locator {
    return this.page.getByRole('heading', { level: 2, name: text });
  }

  /** One planned meal, found by the label shown on its card. */
  meal(day: string, label: string): Locator {
    return this.dayRow(day).getByRole('listitem').filter({ hasText: label });
  }

  // ── Adding ────────────────────────────────────────────────────────────────

  /** The pair of add actions, folded away once every eligible member has a meal. */
  pickRecipeButton(day: string): Locator {
    return this.dayRow(day).getByRole('button', { name: /^Pick a recipe for/ });
  }

  addAnotherButton(day: string): Locator {
    return this.dayRow(day).getByRole('button', { name: /^Add another meal on/ });
  }

  /**
   * Unfolds the add actions if the day is fully planned.
   *
   * Every add method goes through this, so a spec can keep adding to a day it just filled without
   * knowing whether the `+` is showing.
   */
  private async revealAddActions(day: string) {
    if ((await this.pickRecipeButton(day).count()) === 0) {
      await this.addAnotherButton(day).click();
    }
  }

  /** Picking a recipe creates the meal outright — no dialog, no save step. */
  async addRecipeMeal(day: string, recipeTitle: string) {
    await this.revealAddActions(day);
    await this.pickRecipeButton(day).click();
    await this.page.getByPlaceholder('Search recipes…').fill(recipeTitle);
    await this.page.getByRole('option', { name: recipeTitle }).click();
    await expect(this.meal(day, recipeTitle)).toBeVisible();
  }

  /** "Add custom" becomes a text field in place; Enter creates. */
  async addFreeTextMeal(day: string, text: string) {
    await this.openCustomEntry(day);
    await this.customEntry(day).fill(text);
    await this.customEntry(day).press('Enter');
    await expect(this.meal(day, text)).toBeVisible();
  }

  async openCustomEntry(day: string) {
    await this.revealAddActions(day);
    await this.dayRow(day)
      .getByRole('button', { name: /^Add a custom meal on/ })
      .click();
    await expect(this.customEntry(day)).toBeFocused();
  }

  /** The open new-entry field on a day. */
  customEntry(day: string): Locator {
    return this.dayRow(day).getByRole('textbox', { name: /^What's for lunch on/ });
  }

  async cancelCustomEntry(day: string) {
    await this.dayRow(day).getByRole('button', { name: 'Cancel' }).click();
  }

  /** "Žiga and Robbie still need a meal" — shown only while a day is *partly* planned. */
  coverageHint(day: string): Locator {
    return this.dayRow(day).getByText(/still needs? a meal/);
  }

  // ── Editing in place ──────────────────────────────────────────────────────

  /** Opens a custom meal's label editor without committing, so a spec can act in between. */
  async openLabelEditor(day: string, label: string) {
    await this.meal(day, label).getByRole('button', { name: label, exact: true }).click();
    await expect(this.labelEditor(day, label)).toBeFocused();
  }

  /**
   * Scoped to the day, not the card. `meal()` filters list items by their visible text, and an open
   * editor puts the label into an input's `value` — which is not text content — so the card stops
   * matching the instant editing begins. The aria-label still carries the original label, so it is
   * unique within the day either way.
   */
  labelEditor(day: string, label: string): Locator {
    return this.dayRow(day).getByRole('textbox', { name: `Name of ${label}` });
  }

  async renameMeal(day: string, from: string, to: string) {
    await this.openLabelEditor(day, from);
    await this.labelEditor(day, from).fill(to);
    await this.labelEditor(day, from).press('Enter');
  }

  /** Opens the who's-eating popover and hands back its content. */
  private async openMemberPicker(day: string, label: string) {
    await this.meal(day, label)
      .getByRole('button', { name: `Who's eating ${label}` })
      .click();

    return this.page.getByRole('dialog');
  }

  /**
   * The names offered in the who's-eating popover, read and closed again without changing anything.
   *
   * Read off the `<label>`s rather than the checkboxes: Radix renders each checkbox as a button with
   * a hidden `<input>` next to it, so `nextElementSibling` finds the input, not the name.
   */
  async assignableMemberNames(day: string, label: string) {
    const popover = await this.openMemberPicker(day, label);
    const names = await popover.locator('label[for^="meal-"]').allInnerTexts();

    await this.page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    return names.map((value) => value.trim());
  }

  /** Leaves exactly `onlyMembers` ticked. Everyone starts ticked, so this unticks the rest. */
  async assignMeal(day: string, label: string, onlyMembers: string[]) {
    const popover = await this.openMemberPicker(day, label);
    const names = await popover.locator('label[for^="meal-"]').allInnerTexts();

    for (const name of names.map((value) => value.trim())) {
      if (!onlyMembers.includes(name)) {
        await popover.getByLabel(name, { exact: true }).click();
      }
    }

    // The set is saved once, when the popover closes.
    await this.page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  }

  async setMealNote(day: string, label: string, note: string) {
    await this.meal(day, label)
      .getByRole('button', { name: `Add a note to ${label}` })
      .click();
    const field = this.dayRow(day).getByRole('textbox', { name: `Note on ${label}` });
    await field.fill(note);
    await field.press('Enter');
  }

  // ── Day notes ─────────────────────────────────────────────────────────────

  async setDayNote(day: string, note: string) {
    await this.dayRow(day)
      .getByRole('button', { name: /note for /i })
      .click();
    const field = this.dayNoteEditor(day);
    await field.fill(note);
    await field.press('Enter');
  }

  private dayNoteEditor(day: string): Locator {
    return this.dayRow(day).getByRole('textbox', { name: /^Note for/ });
  }

  async clearDayNote(day: string) {
    if (
      (await this.dayRow(day)
        .getByRole('button', { name: /^Edit the note for /i })
        .count()) === 0
    ) {
      return;
    }

    await this.setDayNote(day, '');
  }

  // ── Moving and removing ───────────────────────────────────────────────────

  private async openMealMenu(day: string, label: string) {
    await this.meal(day, label)
      .getByRole('button', { name: `Meal actions for ${label}` })
      .click();
  }

  /** The keyboard/touch move path: `⋯ → Move to day → <weekday>`. */
  async moveMealToDay(day: string, label: string, targetWeekday: string) {
    await this.openMealMenu(day, label);
    await this.page.getByRole('menuitem', { name: 'Move to day' }).click();
    await this.page.getByRole('menuitem', { name: new RegExp(`^${targetWeekday},`) }).click();
  }

  /** Removes immediately — the confirmation is an Undo toast, not a dialog. */
  async removeMeal(day: string, label: string) {
    await this.openMealMenu(day, label);
    await this.page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(this.meal(day, label)).toBeHidden();
  }

  async removeMealIfPresent(day: string, label: string) {
    if ((await this.meal(day, label).count()) === 0) {
      return;
    }

    await this.removeMeal(day, label);
  }

  /** Sonner's live region, where the Undo action lives. */
  toasts(): Locator {
    return this.page.getByRole('region', { name: /Notifications/ });
  }

  async undoRemove() {
    await this.toasts().getByRole('button', { name: 'Undo' }).click();
  }

  /**
   * The pointer path, which shares no code with the menu path above — a broken drag would otherwise
   * sail straight past the move spec.
   */
  async dragMeal(fromDay: string, label: string, toDay: string) {
    await this.drag.onto(this.meal(fromDay, label).getByRole('button', { name: `Move ${label}` }), this.dayRow(toDay));
  }

  // ── Week navigation ───────────────────────────────────────────────────────

  async nextWeeks() {
    await this.page.getByRole('link', { name: 'Next weeks' }).click();
  }

  async previousWeeks() {
    await this.page.getByRole('link', { name: 'Previous weeks' }).click();
  }

  async goToToday() {
    await this.page.getByRole('link', { name: 'Today' }).click();
  }

  async setWeeksShown(weeks: 1 | 2 | 4) {
    await this.page.getByLabel('Weeks shown').click();
    await this.page.getByRole('option', { name: `${weeks} week${weeks === 1 ? '' : 's'}` }).click();
  }

  dayCards(): Locator {
    return this.page.locator('[data-testid^="meal-plan-day-"]');
  }
}
