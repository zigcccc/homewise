import { type ListBlobResult, type PutBlobResult } from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImagesService, type ManagedImageUpdate } from '#modules/images/images.service';

const blobUrl = (pathname: string) => `https://blob.example/${pathname}`;

/** A stored blob, as the store describes one. */
const storedBlob = (pathname: string) =>
  ({
    contentDisposition: `inline; filename="${pathname}"`,
    contentType: 'image/jpeg',
    downloadUrl: `${blobUrl(pathname)}?download=1`,
    etag: `etag-${pathname}`,
    pathname,
    size: 4,
    uploadedAt: new Date('2026-08-06T00:00:00.000Z'),
    url: blobUrl(pathname),
  }) satisfies PutBlobResult & ListBlobResult['blobs'][number];

const listing = (...pathnames: string[]) =>
  ({ blobs: pathnames.map(storedBlob), hasMore: false }) satisfies ListBlobResult;

// Vercel blob is an external service — the one category these tests are allowed to stand in for.
vi.mock('@vercel/blob', () => ({
  del: vi.fn(async () => undefined),
  list: vi.fn(async () => listing()),
  put: vi.fn(async (pathname: string) => storedBlob(pathname)),
}));

const { del, list, put } = await import('@vercel/blob');

beforeEach(() => {
  vi.mocked(del).mockClear();
  vi.mocked(put).mockClear();
  vi.mocked(list).mockClear();
  vi.mocked(list).mockResolvedValue(listing());
});

/** A resolved update whose commit/rollback just record that they ran. */
function trackedUpdate(value: string | null = 'https://blob.example/pets/1/new.jpg') {
  const commit = vi.fn(async () => undefined);
  const rollback = vi.fn(async () => undefined);

  return { commit, rollback, update: { changed: true, commit, rollback, value } satisfies ManagedImageUpdate };
}

describe('commitManagedImage', () => {
  it('retires the old blob once the row is written', async () => {
    const { commit, rollback, update } = trackedUpdate();

    await expect(ImagesService.commitManagedImage(update, async () => true)).resolves.toBe(true);

    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rolls the new upload back when the row vanished mid-request', async () => {
    // The path no user can reach on purpose: another member deleted the profile between the upload
    // and the update, so the write matched nothing. Without the rollback the blob is orphaned
    // storage that nothing will ever point at or notice.
    const { commit, rollback, update } = trackedUpdate();

    await expect(ImagesService.commitManagedImage(update, async () => false)).resolves.toBe(false);

    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when the write itself fails', async () => {
    const { commit, rollback, update } = trackedUpdate();
    const failure = new Error('connection lost');

    await expect(
      ImagesService.commitManagedImage(update, () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('still reports whether the row persisted when no image changed', async () => {
    const unchanged: ManagedImageUpdate = { changed: false };

    await expect(ImagesService.commitManagedImage(unchanged, async () => true)).resolves.toBe(true);
    await expect(ImagesService.commitManagedImage(unchanged, async () => false)).resolves.toBe(false);
  });

  it('runs the write exactly once', async () => {
    const write = vi.fn(async () => true);

    await ImagesService.commitManagedImage({ changed: false }, write);

    expect(write).toHaveBeenCalledOnce();
  });

  it('rolls back a clear that found no row', async () => {
    // `value: null` is a cleared picture. There is no new blob to drop, but the rollback still runs —
    // it is what guards the old one from being retired on a write that never happened.
    const { commit, rollback, update } = trackedUpdate(null);

    await ImagesService.commitManagedImage(update, async () => false);

    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('cleanupOwnedImage', () => {
  it('deletes a blob inside the owned namespace', async () => {
    await ImagesService.cleanupOwnedImage('https://blob.example/pet-profiles/42/photo.jpg', 'pet-profiles/42');

    expect(del).toHaveBeenCalledWith('https://blob.example/pet-profiles/42/photo.jpg', expect.anything());
  });

  it('refuses to delete a shared avatar', async () => {
    // The guard that matters: avatars are deduplicated, so several profiles point at one blob.
    // Deleting it because one of them changed picture would break every other profile using it.
    await ImagesService.cleanupOwnedImage('https://blob.example/avatars/bear.svg', 'pet-profiles/42');

    expect(del).not.toHaveBeenCalled();
  });

  it('refuses to delete another entity type’s blob', async () => {
    await ImagesService.cleanupOwnedImage('https://blob.example/child-profiles/7/photo.jpg', 'pet-profiles/42');

    expect(del).not.toHaveBeenCalled();
  });

  it('guards on the whole top-level segment, not a prefix of it', async () => {
    await ImagesService.cleanupOwnedImage('https://blob.example/pet-profiles-archive/1/photo.jpg', 'pet-profiles/42');

    expect(del).not.toHaveBeenCalled();
  });

  it('deletes a sibling entity’s blob within the same namespace', async () => {
    // Only the top-level segment is checked, deliberately — a rename moves a blob between ids.
    await ImagesService.cleanupOwnedImage('https://blob.example/pet-profiles/99/photo.jpg', 'pet-profiles/42');

    expect(del).toHaveBeenCalledOnce();
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a malformed URL', 'not-a-url'],
    ['a client-relative path', '/pet-profiles/42/photo.jpg'],
  ])('does nothing and does not throw for %s', async (_what, url) => {
    await expect(ImagesService.cleanupOwnedImage(url, 'pet-profiles/42')).resolves.toBeUndefined();

    expect(del).not.toHaveBeenCalled();
  });

  it('swallows a storage failure rather than failing a committed request', async () => {
    // This runs after the DB change has already committed. Throwing here would report failure for
    // something that succeeded.
    vi.mocked(del).mockRejectedValueOnce(new Error('blob store unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      ImagesService.cleanupOwnedImage('https://blob.example/pet-profiles/42/photo.jpg', 'pet-profiles/42')
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('resolveManagedImage', () => {
  const config = { ownedPrefix: 'pet-profiles/42' };

  it('reports no change when the payload mentions no picture', async () => {
    await expect(ImagesService.resolveManagedImage({}, 'https://blob.example/old.jpg', config)).resolves.toEqual({
      changed: false,
    });

    expect(put).not.toHaveBeenCalled();
  });

  it('treats an unchanged URL string as no change', async () => {
    const existing = 'https://blob.example/pet-profiles/42/photo.jpg';

    await expect(ImagesService.resolveManagedImage({ image: existing }, existing, config)).resolves.toEqual({
      changed: false,
    });
  });

  it('clears the column when the field was blanked', async () => {
    const update = await ImagesService.resolveManagedImage({ image: '' }, 'https://blob.example/old.jpg', config);

    expect(update).toMatchObject({ changed: true, value: null });
    expect(put).not.toHaveBeenCalled();
  });

  it('uploads a photo into the owned namespace before anything is written', async () => {
    const file = new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' });

    const update = await ImagesService.resolveManagedImage({ image: file }, null, config);

    expect(put).toHaveBeenCalledOnce();
    expect(vi.mocked(put).mock.calls[0]?.[0]).toBe('pet-profiles/42/photo.jpg');
    expect(update).toMatchObject({ changed: true, value: 'https://blob.example/pet-profiles/42/photo.jpg' });
  });

  it('leaves the old blob alone until commit', async () => {
    // The ordering the whole design exists for: upload first, write, and only then retire the old
    // blob — so a failed write can never leave the row pointing at something already deleted.
    const file = new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' });

    await ImagesService.resolveManagedImage({ image: file }, 'https://blob.example/pet-profiles/42/old.jpg', config);

    expect(del).not.toHaveBeenCalled();
  });

  it('reuses an existing shared avatar instead of uploading again', async () => {
    vi.mocked(list).mockResolvedValue(listing('avatars/bear.svg'));
    const avatar = new File([new Uint8Array(4)], 'bear.svg', { type: 'image/svg+xml' });

    const update = await ImagesService.resolveManagedImage({ avatar }, null, config);

    expect(update).toMatchObject({ changed: true, value: blobUrl('avatars/bear.svg') });
    expect(put).not.toHaveBeenCalled();
  });

  it('resolves a concurrent first upload to the winner’s blob rather than clobbering it', async () => {
    // Two members pick the same new avatar at once. The loser's no-overwrite `put` conflicts; the
    // blob that exists by then is the answer, and overwriting it would swap the bytes underneath
    // whoever already points at it.
    vi.mocked(put).mockRejectedValueOnce(new Error('blob already exists'));
    vi.mocked(list).mockResolvedValueOnce(listing()).mockResolvedValueOnce(listing('avatars/bear.svg'));
    const avatar = new File([new Uint8Array(4)], 'bear.svg', { type: 'image/svg+xml' });

    const update = await ImagesService.resolveManagedImage({ avatar }, null, config);

    expect(update).toMatchObject({ changed: true, value: blobUrl('avatars/bear.svg') });
  });

  it('re-throws when the upload failed for a reason other than a race', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('blob store unavailable'));
    const avatar = new File([new Uint8Array(4)], 'bear.svg', { type: 'image/svg+xml' });

    await expect(ImagesService.resolveManagedImage({ avatar }, null, config)).rejects.toThrow('blob store unavailable');
  });

  it('rolls a new photo back but leaves a shared avatar in place', async () => {
    // Rollback goes through the same ownership guard as cleanup, which is what stops an abandoned
    // write from deleting a shared avatar other profiles are still using.
    const photo = await ImagesService.resolveManagedImage(
      { image: new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' }) },
      null,
      config
    );
    await ImagesService.commitManagedImage(photo, async () => false);

    expect(del).toHaveBeenCalledOnce();
    vi.mocked(del).mockClear();

    const avatar = await ImagesService.resolveManagedImage(
      { avatar: new File([new Uint8Array(4)], 'bear.svg', { type: 'image/svg+xml' }) },
      null,
      config
    );
    await ImagesService.commitManagedImage(avatar, async () => false);

    expect(del).not.toHaveBeenCalled();
  });
});
