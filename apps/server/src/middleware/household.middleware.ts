import { setTag } from '@sentry/hono/node';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { notFound } from '#lib/errors';
import { ActivityService } from '#modules/activity/activity.service';
import { type HouseholdMemberRole } from '#modules/households/households.model';
import { type HouseholdSummary, HouseholdsService } from '#modules/households/households.service';
import { type HouseholdEvent } from '#modules/realtime/realtime.model';
import { RealtimeService } from '#modules/realtime/realtime.service';
import { type AppContext } from '#types/app.type';

export type HouseholdContext = {
  Variables: AppContext['Variables'] & {
    household: HouseholdSummary;
    /** Who is asking, resolved alongside the household rather than in a second query. */
    viewer: { isOwner: boolean; memberId: number | null; role: HouseholdMemberRole };
    /**
     * Announces what this request changed to the rest of the household, and records it in the
     * activity log. Buffered and flushed once the handler succeeds — call it as many times as the
     * handler has distinct effects.
     *
     * Each event's `label` decides whether it is *also* activity: the affected thing's name to log
     * it, `null` to invalidate quietly. Cascades and chatter take `null`.
     */
    emit: (...events: HouseholdEvent[]) => void;
  };
};

/**
 * Resolves the caller's household once per request and puts it on the context, so handlers can read
 * `c.var.household` instead of repeating a lookup + 404 check. Mount it on household-scoped sub-apps
 * only — routes that must work without a household (creating one, reading/accepting an invite) stay
 * outside of it.
 *
 * It also owns realtime dispatch, because the two are the same concern: an event is only ever
 * addressed to the household resolved here, and taking the id from anywhere else is how a change
 * ends up broadcast to the wrong people. Handlers describe *what* changed via `c.var.emit`; who
 * hears about it is not theirs to decide.
 */
export const withHousehold = createMiddleware<HouseholdContext>(async (c, next) => {
  const row = await HouseholdsService.readSummaryForUser(c.var.user.id);

  if (!row) {
    throw notFound('Household');
  }

  const { household, memberId, role: memberRole } = row;
  const isOwner = household.ownerId === c.var.user.id;

  // The join misses only when the caller matched on `ownerId` alone, and an owner is an adult by
  // definition — every other path here has a member row.
  const role = memberRole ?? (isOwner ? 'adult' : null);

  if (!role) {
    throw notFound('Household');
  }

  c.set('household', household);
  c.set('viewer', { isOwner, memberId, role });
  // Every error, trace and log from a household-scoped route becomes filterable by household — the
  // unit a bug report ("our recipes stopped syncing") actually arrives in.
  setTag('householdId', household.id);
  setTag('householdRole', role);

  const buffered: HouseholdEvent[] = [];
  c.set('emit', (...events) => {
    buffered.push(...events);
  });

  await next();

  // A thrown HTTPException never reaches this line, and a validator's 400 leaves `ok` false — so
  // only work that actually landed is announced.
  if (buffered.length === 0 || !c.res.ok) {
    return;
  }

  // Awaited rather than fired and forgotten: on a serverless host the invocation can freeze the
  // moment the response is returned, which would drop these silently. One batched round trip each
  // for the whole request, and both swallow their own failures.
  //
  // Recorded before it's announced, so a tab that refetches the moment the message lands finds the
  // line already there. Only events carrying a `label` become rows — see `householdEventModel`.
  await ActivityService.record(household.id, c.var.user, buffered);

  await RealtimeService.publish(household.id, {
    actorId: c.var.user.id,
    events: buffered,
    origin: c.req.header('x-homewise-client-id') ?? null,
  });
});

/** Guards owner-only actions. Must run after {@link withHousehold}. */
export const withHouseholdOwner = createMiddleware<HouseholdContext>(async (c, next) => {
  if (!c.var.viewer.isOwner) {
    throw new HTTPException(403, { message: 'Only household owners can perform this action.' });
  }

  return next();
});
