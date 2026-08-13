import { type HouseholdEventEntity, type HouseholdEventOperation } from '@homewise/server/realtime';

/**
 * What to call each kind of thing in a feed line.
 *
 * A `Record` keyed by the server's entity union rather than a lookup with a fallback, so adding an
 * entity fails the build here instead of shipping a line that reads "Žiga added Ana Novak".
 */
export const ACTIVITY_ENTITY_NOUNS: Record<HouseholdEventEntity, string> = {
  child_dictionary_entry: 'the word',
  child_profile: 'the kid profile',
  contact: 'the contact',
  expense: 'the expense',
  expense_category: 'the expense category',
  household: 'the household',
  household_invite: 'an invite for',
  household_member: 'the member',
  ingredient: 'the ingredient',
  meal_plan: 'the meal',
  medical_info: 'the medical record for',
  pet_profile: 'the pet profile',
  recipe: 'the recipe',
  recipe_tag: 'the recipe tag',
  shopping_list: 'the shopping list',
  storage_item: 'the item',
  storage_location: 'the storage location',
  store: 'the shop',
};

/**
 * The same things named on their own, for the feed's filter. Separate from the nouns above because
 * these stand alone in a picker — "an invite for" is a sentence fragment, not a choice.
 */
export const ACTIVITY_ENTITY_FILTER_LABELS: Record<HouseholdEventEntity, string> = {
  child_dictionary_entry: 'Dictionary words',
  child_profile: 'Kid profiles',
  contact: 'Contacts',
  expense: 'Expenses',
  expense_category: 'Expense categories',
  household: 'Household settings',
  household_invite: 'Invites',
  household_member: 'Members',
  ingredient: 'Ingredients',
  meal_plan: 'Meal plan',
  medical_info: 'Medical records',
  pet_profile: 'Pet profiles',
  recipe: 'Recipes',
  recipe_tag: 'Recipe tags',
  shopping_list: 'Shopping lists',
  storage_item: 'Storage items',
  storage_location: 'Storage locations',
  store: 'Shops',
};

/**
 * Plain past-tense verbs rather than the DB's `create`/`update`/`delete`. "Removed" over "deleted"
 * on purpose: this is a household telling itself what happened, not a changelog.
 */
const VERBS: Record<HouseholdEventOperation, string> = {
  create: 'added',
  update: 'updated',
  delete: 'removed',
};

/**
 * The sentence a feed line makes, minus the actor: "added the contact". The label is rendered
 * separately so it can be emphasised — and, where the row still exists, linked.
 *
 * A line standing for several changes says so instead of repeating itself. Only updates ever fold
 * into one — see `ActivityService.record` — so the plural sentence needs no verb of its own.
 */
export function activityAction(entity: HouseholdEventEntity, operation: HouseholdEventOperation, count: number) {
  const noun = ACTIVITY_ENTITY_NOUNS[entity];

  return count > 1 ? `made ${count} updates to ${noun}` : `${VERBS[operation]} ${noun}`;
}

/** Initials for the actor's avatar, from a name that was snapshotted and may be anything. */
export function actorInitials(actorName: string) {
  const [first = '', second = ''] = actorName.trim().split(/\s+/);

  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase() || '?';
}
