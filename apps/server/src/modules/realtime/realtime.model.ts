import { createSelectSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { fieldChangeModel } from '#lib/models';

/**
 * The Ably message name every household change is published under. A single name (rather than one
 * per entity) keeps the client at one subscription: it invalidates query keys, so it wants every
 * change, not a filtered slice.
 */
export const HOUSEHOLD_EVENT_NAME = 'change';

/**
 * What changed, named for the domain rather than the table — straight off the DB enum, because every
 * labelled event is also persisted as a row of `household_activity`.
 *
 * Users are absent: `/users/me` doesn't run inside `withHousehold` and has no household to announce
 * to. Households, members and invites are here — `/households/my/*` **is** household-scoped.
 */
export const householdEventEntity = createSelectSchema(schema.householdActivityEntityEnum);
export type HouseholdEventEntity = z.infer<typeof householdEventEntity>;

export const householdEventOperation = createSelectSchema(schema.householdActivityOperationEnum);
export type HouseholdEventOperation = z.infer<typeof householdEventOperation>;

/**
 * Deliberately not the entity itself — only enough for a subscriber to pick the query keys it needs
 * to invalidate, plus what the activity log has to keep.
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
  /**
   * What to call the affected thing in the activity feed — snapshotted here because after a delete
   * there is nothing left to look it up from.
   *
   * `null` means "invalidate, but don't log": the cascade halves of a multi-entity mutation, and the
   * chatter (ticking a shopping-list item) that would bury a day's real changes. Required rather than
   * optional so every emit site has to decide, and no new one can skip the log by forgetting.
   */
  label: z.string().nullable(),
  /**
   * What the save changed, from `changedColumns`. Optional, unlike `label`: most events have no diff
   * to take, and the absent case is meaningfully different from the empty one.
   *
   * An **empty array** means the diff ran and found nothing — that save is not logged at all, because
   * opening a form and closing it is not household history. **Absent** means no diff was taken, and
   * the line is logged the way it always was.
   */
  changes: z.array(fieldChangeModel).optional(),
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
  /** Who did it. Read by the activity log, which stores it alongside a snapshot of the name. */
  actorId: z.string(),
  events: z.array(householdEventModel).min(1),
});
export type HouseholdEventMessage = z.infer<typeof householdEventMessageModel>;
