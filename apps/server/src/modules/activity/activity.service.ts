import { captureException } from '@sentry/hono/node';
import { and, desc, eq, gt, ilike, inArray, lte, sql } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { type Filters, readPagedList } from '#db/utils';
import { type FieldChange } from '#lib/models';
import { type HouseholdEvent } from '#modules/realtime/realtime.model';

import { type ListActivityQueryParams } from './activity.model';

/** Who a row is attributed to. Both halves are stored: the id can be nulled, the name never is. */
type Actor = { id: string; name: string };

/** An event that asked to be logged — the same payload, minus the `null` that means "don't". */
type LoggedEvent = HouseholdEvent & { label: string };

/** How long a line stays open to being repeated. Short enough that a run can't straddle midnight. */
const RUN_WINDOW = sql`now() - interval '1 hour'`;

/** The cap on what gets *stored*, so the table can't grow by the length of a recipe method. */
const VALUE_LIMIT = 140;

const clip = (value: FieldChange['from']) =>
  typeof value === 'string' && value.length > VALUE_LIMIT ? `${value.slice(0, VALUE_LIMIT)}…` : value;

/** The diff as it is stored: same fields, with anything long cut down to a readable length. */
const readableChanges = (event: HouseholdEvent): FieldChange[] =>
  (event.changes ?? []).map((change) => ({ ...change, from: clip(change.from), to: clip(change.to) }));

/** The household's record of who changed what. Written from `withHousehold`, read by the feed. */
export class ActivityService {
  /**
   * Keeps the labelled half of a request's events.
   *
   * Never throws, like `RealtimeService.publish`: the mutation has already committed, so a failed
   * insert must not turn a change that landed into an error. A dropped line goes to Sentry instead.
   */
  public static async record(householdId: number, actor: Actor, events: HouseholdEvent[]) {
    // `flatMap` so the surviving `label` narrows on its own. An empty diff is dropped: it changed nothing.
    const loggable = events.flatMap((event) =>
      event.label === null || event.changes?.length === 0 ? [] : [{ ...event, label: event.label }]
    );
    const [first, ...rest] = loggable;

    if (first === undefined) {
      return;
    }

    try {
      // Only the head of a request can continue a run — anything behind it is no longer the newest line.
      const pending = (await ActivityService.fold(householdId, actor.id, first)) ? rest : loggable;

      if (pending.length > 0) {
        await db.insert(schema.householdActivity).values(
          pending.map((event) => ({
            householdId,
            actorId: actor.id,
            actorName: actor.name,
            entity: event.entity,
            operation: event.operation,
            entityId: event.id,
            parentId: event.parentId ?? null,
            label: event.label,
            changes: readableChanges(event),
          }))
        );
      }
    } catch (error) {
      console.error(`Failed to record activity for household ${householdId}:`, error);
      captureException(error, { tags: { householdId } });
    }
  }

  /**
   * Counts an edit into the household's newest line rather than repeating it, when it says the same
   * thing: same person, same row, same wording, still inside {@link RUN_WINDOW}.
   *
   * Only ever the *newest* line, which is what keeps this invisible to the read path — the folded row
   * keeps its id and stays newest, so no offset moves and no reader's anchor is invalidated.
   *
   * Updates only: the same row cannot be created or deleted twice. One statement, so two requests
   * racing here either both fold or both miss, and neither outcome is wrong.
   */
  private static async fold(householdId: number, actorId: string, event: LoggedEvent) {
    if (event.operation !== 'update') {
      return false;
    }

    const columns = schema.householdActivity;
    const newest = db
      .select({ id: columns.id })
      .from(columns)
      .where(eq(columns.householdId, householdId))
      .orderBy(desc(columns.id))
      .limit(1);

    const folded = await db
      .update(columns)
      .set({
        count: sql`${columns.count} + 1`,
        // Appended, not merged. Bound as text and cast — a bare array reaches the driver as a PG array.
        changes: sql`${columns.changes} || ${JSON.stringify(readableChanges(event))}::jsonb`,
      })
      .where(
        and(
          inArray(columns.id, newest),
          eq(columns.actorId, actorId),
          eq(columns.entity, event.entity),
          eq(columns.operation, 'update'),
          eq(columns.label, event.label),
          // Not `=`: an entity naming no single row logs a null id, and two of those are one line.
          sql`${columns.entityId} is not distinct from ${event.id}`,
          gt(columns.updatedAt, RUN_WINDOW)
        )
      )
      .returning({ id: columns.id });

    return folded.length > 0;
  }

  /** One page of the feed, newest first. */
  public static async list(
    householdId: number,
    { actorId, entity, maxId, page, pageSize, search }: ListActivityQueryParams
  ) {
    const columns = schema.householdActivity;
    const filters: Filters = [eq(columns.householdId, householdId)];

    if (actorId) {
      filters.push(eq(columns.actorId, actorId));
    }

    if (entity) {
      filters.push(eq(columns.entity, entity));
    }

    if (search) {
      filters.push(ilike(columns.label, `%${search}%`));
    }

    // Inclusive: the anchor is a row the reader has already been shown, and page 1 of the frozen set
    // still has to contain it.
    if (maxId !== undefined) {
      filters.push(lte(columns.id, maxId));
    }

    return readPagedList({
      filters,
      page,
      pageSize,
      table: columns,
      // `id` is serial, so this is `createdAt` order — and it is total, which is what a page needs.
      read: (query) => db.query.householdActivity.findMany({ ...query, orderBy: desc(columns.id) }),
    });
  }
}
