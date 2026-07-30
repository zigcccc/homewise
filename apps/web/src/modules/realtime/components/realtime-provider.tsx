import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { AblyProvider, ChannelProvider, useAbly, useChannel, useConnectionStateListener } from 'ably/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  HOUSEHOLD_EVENT_NAME,
  type HouseholdEvent,
  type HouseholdEventEntity,
  householdEventMessageModel,
} from '@homewise/server/realtime';

import { CLIENT_ID } from '@/api/client';
import { invalidateChildProfile } from '@/modules/child-profiles';
import { invalidateContacts } from '@/modules/contacts';
import { invalidateIngredients } from '@/modules/ingredients';
import { invalidatePetProfile } from '@/modules/pet-profiles';
import { invalidateRecipe, invalidateRecipes } from '@/modules/recipes';

import { realtimeClient } from '../realtime.client';

/** Both profile domains show contacts and medical records, so those changes reach either card. */
function invalidateProfiles(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['child-profiles'] });
  void queryClient.invalidateQueries({ queryKey: ['pet-profiles'] });
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
      void queryClient.invalidateQueries({ queryKey: ['child-dictionaries', parentId] });
    }
    // The profile card and its detail both carry the entry count.
    void queryClient.invalidateQueries({ queryKey: ['child-profiles'] });
  },
  child_profile: (queryClient, { id }) => {
    if (id === null) {
      void queryClient.invalidateQueries({ queryKey: ['child-profiles'] });
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
      void queryClient.invalidateQueries({ queryKey: ['pet-profiles'] });
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
  const authorizedFor = useRef(channel);

  // Declared before `useChannel` so it runs before the attach on every mount pass. The token in
  // hand names one channel, so when the household changes under a live connection — deleting a
  // household and making another, or signing out and in as someone else without a reload — the old
  // token can't authorize the new channel and the attach would be refused (40160).
  useEffect(() => {
    if (authorizedFor.current === channel) {
      return;
    }

    authorizedFor.current = channel;
    void ably.auth.authorize();
  }, [ably, channel]);

  useChannel(channel, HOUSEHOLD_EVENT_NAME, (message) => {
    const parsed = householdEventMessageModel.safeParse(message.data);

    // Our server is the only publisher this token can hear, so a malformed payload means a version
    // skew rather than an attack — drop it instead of throwing inside the SDK's listener.
    if (!parsed.success || parsed.data.origin === CLIENT_ID) {
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
