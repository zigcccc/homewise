import { expect, type Locator, type Page } from '@playwright/test';

import { nameStartsWith } from '../support/text';
import { Drag } from './drag';
import { Picker } from './picker';

/**
 * The weekly meal plan.
 *
 * Everything on this page edits in place, so there is no dialog surface here at all. Editors are
 * located by `aria-label` and scoped to the card or day they belong to — several cards carry
 * identically-shaped controls, and an unscoped role query would match whichever rendered first.
 *
 * Every method takes an ISO day, and `goto` takes the Monday to open on. Workers are isolated by
 * having a household each, but the tests inside one share it, so each owns a distinct far-future
 * week reached straight through the URL — no two tests, and no human, ever touch the same days.
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
  dayRow(day: string) {
    return this.page.getByTestId(`meal-plan-day-${day}`);
  }

  /** The header above a week's group of day cards. */
  weekHeader(text: string) {
    return this.page.getByRole('heading', { level: 2, name: text });
  }

  /** One planned meal, found by the label shown on its card. */
  meal(day: string, label: string) {
    return this.dayRow(day).getByRole('listitem').filter({ hasText: label });
  }

  // ── Adding ────────────────────────────────────────────────────────────────

  /** The pair of add actions, folded away once every eligible member has a meal. */
  pickRecipeButton(day: string) {
    return this.dayRow(day).getByRole('button', { name: /^Pick a recipe for/ });
  }

  addAnotherButton(day: string) {
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
    await new Picker(this.page, 'Search recipes…').pick(recipeTitle);
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
  customEntry(day: string) {
    return this.dayRow(day).getByRole('textbox', { name: /^What's for lunch on/ });
  }

  async cancelCustomEntry(day: string) {
    await this.dayRow(day).getByRole('button', { name: 'Cancel' }).click();
  }

  /** "Žiga and Robbie still need a meal" — shown only while a day is *partly* planned. */
  coverageHint(day: string) {
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
  labelEditor(day: string, label: string) {
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

  /**
   * Returns only once the server has acknowledged the note and the editor has closed.
   *
   * Enter alone proves nothing: it returns before the app has done anything, and the caller's next
   * assertion can be satisfied by the *open* editor — React reseeds the textarea's `defaultValue`
   * from `day.note`, and a textarea's default value is its text content. So a reader could not tell
   * a saved note from an unsaved one, and when this spec did fail (once in thirteen full runs, on the
   * note being absent after a reload) the failure surfaced fifteen lines later with nothing to say
   * about the write. That cause was never reproduced — this does not claim to fix it, it makes the
   * next occurrence point at itself.
   */
  async setDayNote(day: string, note: string) {
    await this.dayRow(day)
      .getByRole('button', { name: /note for /i })
      .click();
    const field = this.dayNoteEditor(day);
    await field.fill(note);

    // Armed before the keypress that triggers it, or the response can land first.
    const saved = this.page.waitForResponse(
      (response) => response.url().includes(`/meal-plan/days/${day}`) && response.request().method() === 'PUT'
    );
    await field.press('Enter');

    expect((await saved).status(), `saving the note on ${day}`).toBe(200);
    await expect(this.dayNoteEditor(day)).toBeHidden();
  }

  private dayNoteEditor(day: string) {
    return this.dayRow(day).getByRole('textbox', { name: /^Note for/ });
  }

  // ── Moving and removing ───────────────────────────────────────────────────

  /** Takes the meal rather than its day and label, so a caller can hand it `.first()` of several. */
  private async openMealMenu(meal: Locator, label: string) {
    await meal.getByRole('button', { name: `Meal actions for ${label}` }).click();
  }

  /** The keyboard/touch move path: `⋯ → Move to day → <weekday>`. */
  async moveMealToDay(day: string, label: string, targetWeekday: string) {
    await this.openMealMenu(this.meal(day, label), label);
    await this.page.getByRole('menuitem', { name: 'Move to day' }).click();
    await this.page.getByRole('menuitem', { name: nameStartsWith(`${targetWeekday},`) }).click();
  }

  /**
   * Removes immediately — the confirmation is an Undo toast, not a dialog.
   *
   * Strict, and stays that way: a spec removing *the* meal wants to hear about a second one.
   */
  async removeMeal(day: string, label: string) {
    await this.openMealMenu(this.meal(day, label), label);
    await this.page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(this.meal(day, label)).toBeHidden();
  }

  /**
   * Clears the day of everything carrying `label` — none, one, or a duplicate. The teardown path.
   *
   * A test that exceeds its timeout has its page closed mid-flight, so its cleanup never runs and its
   * meal survives. The retry then plans a second meal with the same label on the same day, and from
   * there every strict locator on that day resolves to two elements: all three attempts fail on the
   * duplicate rather than on whatever actually went wrong. Removing `.first()` until the day is empty
   * is what makes a bad attempt something the next one can recover from. See issue #41.
   */
  async removeAllMeals(day: string, label: string) {
    for (let remaining = await this.meal(day, label).count(); remaining > 0; remaining -= 1) {
      await this.openMealMenu(this.meal(day, label).first(), label);
      await this.page.getByRole('menuitem', { name: 'Remove' }).click();
      // By count, not by the removed card's own visibility: with two on the day, `.first()` is still
      // matched by the survivor the moment the first one goes.
      await expect(this.meal(day, label)).toHaveCount(remaining - 1);
    }
  }

  /** Sonner's live region, where the Undo action lives. */
  toasts() {
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

  dayCards() {
    return this.page.locator('[data-testid^="meal-plan-day-"]');
  }
}
