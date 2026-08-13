import { captureException } from '@sentry/hono/node';
import { and, desc, eq, gt, ilike, inArray, lt, sql } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { type Filters } from '#db/utils';
import { type FieldChange } from '#lib/models';
import { type HouseholdEvent } from '#modules/realtime/realtime.model';

import { type ListActivityQueryParams } from './activity.model';

/** Who a row is attributed to. Both halves are stored: the id can be nulled, the name never is. */
type Actor = { id: string; name: string };

/** An event that asked to be logged — the same payload, minus the `null` that means "don't". */
type LoggedEvent = HouseholdEvent & { label: string };

/**
 * How long a line stays open to being repeated. Long enough to swallow one sitting at the form,
 * short enough that a morning edit and an evening edit stay two lines — and short enough that a run
 * can't straddle the reader's midnight, which would file it under the wrong day heading.
 *
 * Measured by the database's clock, because the timestamps it compares are the database's too.
 */
const RUN_WINDOW = sql`now() - interval '1 hour'`;

/**
 * The longest a logged value can be. A description is free text and a feed line is one line — this
 * is the cap on what gets *stored*, so the table can't grow by the length of a recipe method; the
 * web shortens further for reading.
 */
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
   * Never throws, for the same reason `RealtimeService.publish` doesn't: by the time this runs the
   * mutation has committed and the response is decided, so a failed insert must not turn a change
   * that landed into an error the user sees. A dropped line goes to Sentry instead.
   */
  public static async record(householdId: number, actor: Actor, events: HouseholdEvent[]) {
    // `flatMap` rather than `filter`, so the surviving `label` narrows to a string on its own. A save
    // whose diff came back empty is dropped here too: it was accepted, but it changed nothing, and
    // opening a form and closing it is not the household's history.
    const loggable = events.flatMap((event) =>
      event.label === null || event.changes?.length === 0 ? [] : [{ ...event, label: event.label }]
    );
    const [first, ...rest] = loggable;

    if (first === undefined) {
      return;
    }

    try {
      // Only the head of a request can continue a run: anything behind it is, by the time it is
      // written, no longer the household's newest line.
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
   * Counts an edit into the household's newest line instead of repeating it, when it says the same
   * thing: same person, same row, same wording, still inside {@link RUN_WINDOW}. Five saves of one
   * profile then read as one line rather than five identical ones.
   *
   * Only ever a candidate because it is the *newest* line, which is what makes this safe: the row it
   * lands on is still the newest afterwards, so nothing in the feed moves and no id changes. The
   * cursor, the page size and every filter are untouched by this.
   *
   * Updates only. The same row cannot be created or deleted twice, so a run of either could only
   * mean two different things that happen to share a label.
   *
   * One statement, so two requests racing here either both fold — `count + 1` twice, under the row
   * lock — or both miss and write a line each. Neither outcome is wrong, only less collapsed.
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
        // Appended, not merged: the row keeps every edit of the run in the order it happened, and the
        // feed collapses them for reading. Bound as text and cast, since a bare array would reach the
        // driver as a Postgres array rather than as JSON.
        changes: sql`${columns.changes} || ${JSON.stringify(readableChanges(event))}::jsonb`,
      })
      .where(
        and(
          inArray(columns.id, newest),
          eq(columns.actorId, actorId),
          eq(columns.entity, event.entity),
          eq(columns.operation, 'update'),
          eq(columns.label, event.label),
          // `is not distinct from`, not `=`: an entity that names no single row logs a null id, and
          // two of those are the same line.
          sql`${columns.entityId} is not distinct from ${event.id}`,
          gt(columns.updatedAt, RUN_WINDOW)
        )
      )
      .returning({ id: columns.id });

    return folded.length > 0;
  }

  /** One page of the feed, newest first. */
  public static async list(householdId: number, { actorId, cursor, entity, limit, search }: ListActivityQueryParams) {
    const columns = schema.householdActivity;
    const filters: Filters = [eq(columns.householdId, householdId)];

    if (cursor) {
      filters.push(lt(columns.id, cursor));
    }

    if (actorId) {
      filters.push(eq(columns.actorId, actorId));
    }

    if (entity) {
      filters.push(eq(columns.entity, entity));
    }

    if (search) {
      filters.push(ilike(columns.label, `%${search}%`));
    }

    // One more than asked for: whether that extra row comes back is the whole "is there another
    // page" answer, and it costs no second count query.
    const rows = await db.query.householdActivity.findMany({
      where: and(...filters),
      orderBy: desc(columns.id),
      limit: limit + 1,
    });

    const entries = rows.slice(0, limit);

    return { entries, nextCursor: rows.length > limit ? (entries.at(-1)?.id ?? null) : null };
  }
}
