import { queryOptions } from '@tanstack/react-query';

import { type HouseholdMemberRole } from '@homewise/server/households';

import { client, parseResponse } from '@/api/client';

/**
 * The Ably channel this household listens on, named by the server.
 *
 * The client deliberately doesn't derive it: the token it gets is signed against exactly this name,
 * so having one source for both removes any way to end up subscribed to another household.
 *
 * `householdId` is **not** sent — the server reads the household from the session. It's here purely
 * to key the cache, because the answer is only valid for the household that was current when it was
 * fetched. Leaving it out and caching under a bare `['realtime', 'channel']` meant that deleting a
 * household and creating another (or accepting an invite into one) kept the old name: the token
 * would then be minted for the new household while the subscription still pointed at the old
 * channel, so Ably refused the attach and live updates silently stopped until a reload. Keying by
 * id makes that unrepresentable instead of relying on every household-lifecycle call site to
 * remember to evict this one.
 *
 * `role` is in the key for the same reason: the answer depends on it too — a member who may read
 * only part of the household is named onto a cut of it — so a role that changes under a live tab
 * would otherwise keep resolving to a channel its next token no longer authorizes.
 */
export function getRealtimeChannelQueryOptions(householdId: number, role: HouseholdMemberRole) {
  return queryOptions({
    queryKey: ['realtime', 'channel', householdId, role],
    queryFn: async () => parseResponse(client.realtime.channel.$get()),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
