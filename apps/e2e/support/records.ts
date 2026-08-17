import { type APIRequestContext } from '@playwright/test';

import { MAX_PAGE_SIZE } from '@homewise/server/models';

import { API_URL } from '../playwright.config';

/** A named, searchable, paginated collection a spec can clean up out of band. */
type DeletablePath = 'contacts' | 'storage-items';

/**
 * Removes a row by name, if it is still there.
 *
 * Two jobs. The first is rows a spec creates somewhere other than where they are deleted: a contact
 * minted as part of a loan, or one unlinked from a profile — unlinking leaves it in the household.
 * The address book can remove either, but making a storage or medical spec detour through a third
 * page to clean up would couple it to a feature it isn't testing. Left behind, they grow the list
 * every later spec on that worker loads.
 *
 * The second is teardown that has to survive a timed-out test, which is why this takes an
 * `APIRequestContext` rather than a `Page`: Playwright closes the page when a test overruns, so
 * anything driving the browser is already too late. Register it with the `cleanup` fixture.
 *
 * A refused request raises rather than passing quietly — this is the only thing between the household
 * and a row that outlives every later run, and a silent 4xx here looks exactly like a clean pass.
 */
export async function deleteByName(api: APIRequestContext, path: DeletablePath, name: string) {
  // Searched and given a full page: these lists are paginated, and the row is rarely on page one.
  const list = await api.get(`${API_URL}/${path}?search=${encodeURIComponent(name)}&pageSize=${MAX_PAGE_SIZE}`);

  if (!list.ok()) {
    throw new Error(`Could not list ${path} to clean up "${name}": ${list.status()} ${list.statusText()}`);
  }

  const { items } = (await list.json()) as { items: { id: number; name: string }[] };
  const row = items.find((candidate) => candidate.name === name);

  if (!row) {
    return;
  }

  const deleted = await api.delete(`${API_URL}/${path}/${row.id}`);

  if (!deleted.ok()) {
    throw new Error(`Could not delete ${path} "${name}": ${deleted.status()} ${deleted.statusText()}`);
  }
}

/**
 * Clears every meal on `day` carrying `label` — the API twin of `MealPlanPage.removeAllMeals`.
 *
 * Every, not the one: a timed-out attempt leaves its meal behind and the retry plans a second with
 * the same label, which is what made one flake cost all three attempts (issue #41). Registered with
 * the `cleanup` fixture, this runs even when that attempt's page is already gone — so the duplicate
 * mostly stops happening, and `removeAllMeals` handles it when it does.
 */
/**
 * Removes a managed member by the name it's displayed under, if it's still on the roster.
 *
 * Worth cleaning up out of band more than most rows: an eligible member (a child, an adult) changes
 * who counts as fed on the meal plan, so one left behind by a timed-out kids or medical spec turns
 * the coverage spec on the same worker red for reasons nothing in that spec explains. The delete
 * cascades through the member's profile and everything under it.
 */
export async function deleteMemberNamed(api: APIRequestContext, name: string) {
  const household = await api.get(`${API_URL}/households/my`);

  if (!household.ok()) {
    throw new Error(`Could not read the household to clean up "${name}": ${household.status()}`);
  }

  const { members } = (await household.json()) as { members: { id: number; displayName: string }[] };
  const member = members.find((candidate) => candidate.displayName === name);

  if (!member) {
    return;
  }

  // Under `/my`, like the read above — the member routes hang off the current household, not off a
  // households collection.
  const deleted = await api.delete(`${API_URL}/households/my/members/${member.id}`);

  if (!deleted.ok()) {
    throw new Error(`Could not remove the member "${name}": ${deleted.status()} ${deleted.statusText()}`);
  }
}

/** Clears a day's note. An empty note deletes the row rather than storing a blank one. */
export async function clearDayNoteOn(api: APIRequestContext, day: string) {
  const saved = await api.put(`${API_URL}/meal-plan/days/${day}`, { data: { note: '' } });

  if (!saved.ok()) {
    throw new Error(`Could not clear the note on ${day}: ${saved.status()} ${saved.statusText()}`);
  }
}

export async function deleteMealsOn(api: APIRequestContext, day: string, label: string) {
  const range = await api.get(`${API_URL}/meal-plan?from=${day}&to=${day}`);

  if (!range.ok()) {
    throw new Error(`Could not read the meal plan for ${day}: ${range.status()} ${range.statusText()}`);
  }

  const { meals } = (await range.json()) as { meals: { id: number; label: string }[] };

  for (const meal of meals.filter((candidate) => candidate.label === label)) {
    const deleted = await api.delete(`${API_URL}/meal-plan/meals/${meal.id}`);

    if (!deleted.ok()) {
      throw new Error(`Could not delete the meal "${label}" on ${day}: ${deleted.status()} ${deleted.statusText()}`);
    }
  }
}
