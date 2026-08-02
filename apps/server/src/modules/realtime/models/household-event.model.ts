import z from 'zod';

/**
 * The Ably message name every household change is published under. A single name (rather than one
 * per entity) keeps the client at one subscription: it invalidates query keys, so it wants every
 * change, not a filtered slice.
 */
export const HOUSEHOLD_EVENT_NAME = 'change';

/**
 * What changed, named for the domain rather than the table. Households, members, invites and users
 * are deliberately absent — those routes don't run inside `withHousehold` and need their own
 * handling.
 */
export const householdEventEntity = z.enum([
  'child_dictionary_entry',
  'child_profile',
  'contact',
  'ingredient',
  /** Any change to a planned meal or a day note — the client caches the window under one range key. */
  'meal_plan',
  'medical_info',
  'pet_profile',
  'recipe',
  'recipe_tag',
]);
export type HouseholdEventEntity = z.infer<typeof householdEventEntity>;

export const householdEventOperation = z.enum(['create', 'update', 'delete']);
export type HouseholdEventOperation = z.infer<typeof householdEventOperation>;

/**
 * Deliberately not the entity itself — only enough for a subscriber to pick the query keys it needs
 * to invalidate and refetch on its own terms.
 */
export const householdEventModel = z.object({
  entity: householdEventEntity,
  /** The row's own id, or `null` when the change isn't about a single identifiable row. */
  id: z.number().int().positive().nullable(),
  /**
   * The owning row's id, for entities the client caches under their parent. A dictionary entry is
   * the case that needs it: its queries are keyed by `dictionaryId`, and the entry id appears in no
   * key at all.
   */
  parentId: z.number().int().positive().optional(),
  operation: householdEventOperation,
});
export type HouseholdEvent = z.infer<typeof householdEventModel>;

/** One message per request: a mutation routinely changes more than one kind of thing. */
export const householdEventMessageModel = z.object({
  /**
   * The `x-homewise-client-id` of the tab whose request caused this. That tab already invalidated
   * optimistically, so it skips the message; every other tab — including other tabs of the same
   * user, which are showing stale data — acts on it.
   */
  origin: z.string().nullable(),
  /** Who did it. Nothing reads it yet; it's here so attribution UX needs no wire change. */
  actorId: z.string(),
  events: z.array(householdEventModel).min(1),
});
export type HouseholdEventMessage = z.infer<typeof householdEventMessageModel>;
