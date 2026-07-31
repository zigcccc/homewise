// Imported directly rather than through a shared barrel: this file is deliberately kept out of the
// main bundle (see `_onboarded.tsx`), and an extra hop risks dragging the Ably client back into it.
import { captureException } from '@sentry/react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { AblyProvider, ChannelProvider, useAbly, useChannel, useConnectionStateListener } from 'ably/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  HOUSEHOLD_EVENT_NAME,
  type HouseholdEvent,
  type HouseholdEventEntity,
  householdEventMessageModel,
} from '@homewise/server/realtime';

import { CLIENT_ID } from '@/api/client';
import { invalidateChildDictionaryEntries } from '@/modules/child-dictionaries';
import { invalidateChildProfile, invalidateChildProfiles } from '@/modules/child-profiles';
import { invalidateContacts } from '@/modules/contacts';
import { invalidateIngredients } from '@/modules/ingredients';
import { invalidatePetProfile, invalidatePetProfiles } from '@/modules/pet-profiles';
import { invalidateRecipe, invalidateRecipes } from '@/modules/recipes';

import { realtimeClient } from '../realtime.client';

/** Both profile domains show contacts and medical records, so those changes reach either card. */
function invalidateProfiles(queryClient: QueryClient) {
  invalidateChildProfiles(queryClient);
  invalidatePetProfiles(queryClient);
}

/**
 * What each kind of change makes stale.
 *
 * A `Record` keyed by the entity union rather than a `switch`, so adding an entity server-side
 * fails the build here instead of quietly delivering events nobody acts on.
 *
 * Mappings are allowed to be broader than the change itself: `invalidateQueries` only refetches
 * queries that are currently mounted, so invalidating a whole domain nobody is looking at costs
 * nothing — and it's why the event payload doesn't need to carry every affected id.
 */
const invalidators: Record<HouseholdEventEntity, (queryClient: QueryClient, event: HouseholdEvent) => void> = {
  child_dictionary_entry: (queryClient, { parentId }) => {
    if (parentId) {
      invalidateChildDictionaryEntries(queryClient, parentId);
    }
    // The profile card and its detail both carry the entry count.
    invalidateChildProfiles(queryClient);
  },
  child_profile: (queryClient, { id }) => {
    if (id === null) {
      invalidateChildProfiles(queryClient);
    } else {
      invalidateChildProfile(queryClient, id);
    }
  },
  contact: (queryClient) => {
    invalidateContacts(queryClient);
    // Contacts are shown on the profiles they're attached to, and deleting one drops those links.
    invalidateProfiles(queryClient);
  },
  ingredient: (queryClient) => invalidateIngredients(queryClient),
  medical_info: (queryClient) => invalidateProfiles(queryClient),
  pet_profile: (queryClient, { id }) => {
    if (id === null) {
      invalidatePetProfiles(queryClient);
    } else {
      invalidatePetProfile(queryClient, id);
    }
  },
  recipe: (queryClient, { id, operation }) => {
    // A deleted recipe has no detail left worth refreshing, and its id would refetch into a 404.
    if (operation === 'delete' || id === null) {
      invalidateRecipes(queryClient);
    } else {
      invalidateRecipe(queryClient, id);
    }
  },
  // Deleting a tag unlinks it from every recipe that carried it, so no single recipe is enough.
  recipe_tag: (queryClient) => invalidateRecipes(queryClient),
};

/** Turns household events into cache invalidations. Renders nothing. */
function RealtimeSync({ channel }: { channel: string }) {
  const queryClient = useQueryClient();
  const ably = useAbly();
  const hasConnected = useRef(false);
  const [authorizedChannel, setAuthorizedChannel] = useState<string | null>(null);

  // The token in hand names exactly one channel, and the client is scoped to the tab rather than to
  // this component — so it outlives the household it was authorized for. Two ways that bites:
  // the household can change under a live connection (delete one, create another; sign out and in
  // as someone else), and this component unmounts and remounts around that change, which is why
  // comparing against the previous `channel` prop can't catch it — the remounted component has no
  // previous value to compare. Asking for a fresh token on every mount covers both, and the request
  // is one the client would have made anyway on its first connect.
  useEffect(() => {
    let active = true;
    const settle = () => {
      if (active) {
        setAuthorizedChannel(channel);
      }
    };

    // Settling on rejection too, rather than staying gated: a failed token request leaves the
    // client with no usable credential, so its own reconnect loop asks for another — and the server
    // always mints against the *current* household. Blocking here would turn a transient blip into
    // a permanently deaf tab, which is the failure we're trying to avoid in the first place.
    //
    // Reported on the way past, though: continuing is the right behaviour, but a token endpoint that
    // has started failing degrades every household's live updates and nothing else would say so.
    ably.auth.authorize().then(settle, (error: unknown) => {
      captureException(error, { tags: { realtimeChannel: channel } });
      settle();
    });

    return () => {
      active = false;
    };
  }, [ably, channel]);

  // `skip` until that token resolves. Attaching alongside the request instead of after it is a
  // race: an attach that reaches Ably still carrying the previous household's token is refused with
  // 40160, and a channel that fails that way is never retried — the tab goes silent for good.
  useChannel({ channelName: channel, skip: authorizedChannel !== channel }, HOUSEHOLD_EVENT_NAME, (message) => {
    const parsed = householdEventMessageModel.safeParse(message.data);

    // Our server is the only publisher this token can hear, so a malformed payload means a version
    // skew rather than an attack — drop it instead of throwing inside the SDK's listener. It's still
    // a bug: a deploy that changed the payload shape leaves every open tab dropping events and
    // showing stale data, with nothing on screen to suggest it.
    if (!parsed.success) {
      captureException(parsed.error, { tags: { realtimeChannel: channel } });
      return;
    }

    if (parsed.data.origin === CLIENT_ID) {
      return;
    }

    for (const event of parsed.data.events) {
      invalidators[event.entity](queryClient, event);
    }
  });

  useConnectionStateListener('connected', () => {
    // The first connect is just startup; the loaders have already fetched everything.
    if (!hasConnected.current) {
      hasConnected.current = true;

      return;
    }

    // Events published while we were away are gone, so there's no way to know what changed. A
    // blanket invalidate is the only correct answer — and a cheap one, since only mounted queries
    // actually refetch.
    void queryClient.invalidateQueries();
    toast.success('Reconnected — refreshing.');
  });

  return null;
}

/**
 * Keeps every tab in a household in step with the others: the server announces what changed, this
 * turns it into a TanStack Query invalidation. The tab that made the change ignores its own event —
 * it invalidated immediately, and pub/sub is only the passive path for everyone else.
 */
export function RealtimeProvider({ channel, children }: { channel: string; children: ReactNode }) {
  return (
    <AblyProvider client={realtimeClient}>
      <ChannelProvider channelName={channel}>
        <RealtimeSync channel={channel} />
        {children}
      </ChannelProvider>
    </AblyProvider>
  );
}
