/**
 * Every namespace this app owns in the blob store, named once.
 *
 * These strings are load-bearing twice over. `ImagesService.cleanupOwnedImage` guards a deletion on
 * the **top-level segment**, so a blob filed under a typo'd root is one no cleanup will ever reach;
 * and the segment below it is what keeps one household's — or one profile's — uploads out of
 * another's listing. Both are the sort of thing a string literal at the call site gets wrong quietly.
 */
export const blobPrefix = {
  childProfile: (profileId: number) => `child-profiles/${profileId}`,
  petProfile: (profileId: number) => `pet-profiles/${profileId}`,
  storageItemPhoto: (householdId: number) => `storage-items/${householdId}`,
  /**
   * Not `avatars/<userId>`, which is where these used to live: that root also holds the shared,
   * deduplicated avatars several profiles point at, and the guard only checks the top-level segment
   * — so retiring one user's picture could have taken an avatar everyone else was using with it.
   */
  userAvatar: (userId: string) => `user-avatars/${userId}`,
};
