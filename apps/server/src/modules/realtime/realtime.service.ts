import { captureException } from '@sentry/hono/node';
import * as Ably from 'ably';

import { env } from '#config/env';

import { HOUSEHOLD_EVENT_NAME, type HouseholdEventMessage } from './realtime.model';

/**
 * REST rather than Realtime: the server only ever publishes. A stateless HTTPS POST is what a
 * per-invocation Vercel lambda can actually do — a persistent WebSocket would be opened and thrown
 * away on every request.
 */
const rest = new Ably.Rest({ key: env.HOMEWISE_ABLY_API_KEY });

/** An hour matches Ably's default and keeps re-auth traffic negligible for a long-lived tab. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

export class RealtimeService {
  /**
   * The one channel a household's members share.
   *
   * The namespace prefix is load-bearing, not cosmetic: household ids restart at 1 in every
   * database, so a single Ably app shared by local dev, a PR preview and production would map three
   * different households onto one channel. Callers never build this string themselves — both the
   * capability and the name handed to the client come from here, so the two cannot drift.
   */
  static channelName(householdId: number) {
    return `${env.HOMEWISE_REALTIME_NAMESPACE}:household:${householdId}`;
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
    try {
      await rest.channels.get(RealtimeService.channelName(householdId)).publish(HOUSEHOLD_EVENT_NAME, message);
    } catch (error) {
      console.error(`Failed to publish realtime events for household ${householdId}:`, error);
      captureException(error, { tags: { householdId } });
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
  static async createTokenRequest(userId: string, householdId: number) {
    return rest.auth.createTokenRequest({
      capability: { [RealtimeService.channelName(householdId)]: ['subscribe'] },
      // Identifies the connection to Ably; presence will need it, and it makes the dashboard legible.
      clientId: userId,
      ttl: TOKEN_TTL_MS,
    });
  }
}
