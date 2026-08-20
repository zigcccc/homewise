import { captureException } from '@sentry/hono/node';
import * as Ably from 'ably';

import { env } from '#config/env';
import { can, readsEverything } from '#lib/permissions';
import { type HouseholdMemberRole } from '#modules/households/households.model';

import { ENTITY_AREAS, HOUSEHOLD_EVENT_NAME, type HouseholdEventMessage } from './realtime.model';

/**
 * REST rather than Realtime: the server only ever publishes. A stateless HTTPS POST is what a
 * per-invocation Vercel lambda can actually do — a persistent WebSocket would be opened and thrown
 * away on every request.
 */
const rest = new Ably.Rest({ key: env.HOMEWISE_ABLY_API_KEY });

/** Who a channel is for: everyone in the household, or the roles that may only read part of it. */
type RealtimeAudience = 'household' | 'guest';

/** An hour matches Ably's default and keeps re-auth traffic negligible for a long-lived tab. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

export class RealtimeService {
  /**
   * A household's channel — the full one its members share, or the `guest` cut of it.
   *
   * The namespace prefix is load-bearing, not cosmetic: household ids restart at 1 in every
   * database, so a single Ably app shared by local dev, a PR preview and production would map three
   * different households onto one channel. Callers never build this string themselves — both the
   * capability and the name handed to the client come from here, so the two cannot drift.
   */
  static channelName(householdId: number, audience: RealtimeAudience = 'household') {
    const suffix = audience === 'guest' ? ':guest' : '';

    return `${env.HOMEWISE_REALTIME_NAMESPACE}:household:${householdId}${suffix}`;
  }

  /** Which of the two a role listens on. Anything short of reading the whole household gets `guest`. */
  static audienceFor(role: HouseholdMemberRole): RealtimeAudience {
    return readsEverything(role) ? 'household' : 'guest';
  }

  /**
   * Announces a batch of changes to the household.
   *
   * Never throws. A broker outage must not turn a mutation that already committed into a failed
   * request — the acting client has its own invalidation and is fine; everyone else refreshes on
   * their next navigation. Same trade-off the invite emails make. (Distinct from configuration,
   * which is required: a missing key stops the server booting, it doesn't degrade quietly.)
   */
  static async publish(householdId: number, message: HouseholdEventMessage) {
    // The guest channel carries the subset an `external` may read, so a grandmother's tab stays live
    // on recipes and the kids without ever being handed an expense's title or a contact's new number.
    // Filtered here rather than per subscriber because there is one message per channel, not per tab.
    const guestEvents = message.events.filter((event) => can('external', ENTITY_AREAS[event.entity], 'read'));

    await Promise.all([
      RealtimeService.publishTo(householdId, 'household', message),
      guestEvents.length > 0
        ? RealtimeService.publishTo(householdId, 'guest', { ...message, events: guestEvents })
        : undefined,
    ]);
  }

  private static async publishTo(householdId: number, audience: RealtimeAudience, message: HouseholdEventMessage) {
    try {
      await rest.channels
        .get(RealtimeService.channelName(householdId, audience))
        .publish(HOUSEHOLD_EVENT_NAME, message);
    } catch (error) {
      console.error(`Failed to publish realtime events for household ${householdId} (${audience}):`, error);
      captureException(error, { tags: { audience, householdId } });
    }
  }

  /**
   * Mints a subscribe-only credential for exactly one household's channel.
   *
   * This is where household isolation is actually enforced. A tab cannot subscribe to another
   * household's channel by asking nicely or by guessing the name — the token it holds is signed
   * against this one resource, and Ably rejects anything else. `publish` is withheld too: only the
   * server describes what changed.
   */
  static async createTokenRequest(userId: string, householdId: number, role: HouseholdMemberRole) {
    return rest.auth.createTokenRequest({
      capability: { [RealtimeService.channelName(householdId, RealtimeService.audienceFor(role))]: ['subscribe'] },
      // Identifies the connection to Ably; presence will need it, and it makes the dashboard legible.
      clientId: userId,
      ttl: TOKEN_TTL_MS,
    });
  }
}
