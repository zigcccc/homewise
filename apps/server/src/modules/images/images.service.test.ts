import { BlobNotFoundError, type HeadBlobResult, type PutBlobResult } from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImagesService, type ManagedImageUpdate } from '#modules/images/images.service';

const blobUrl = (pathname: string) => `https://blob.example/${pathname}`;

/** A stored blob, as the store describes one. */
const storedBlob = (pathname: string) =>
  ({
    cacheControl: 'public, max-age=31536000',
    contentDisposition: `inline; filename="${pathname}"`,
    contentType: 'image/jpeg',
    downloadUrl: `${blobUrl(pathname)}?download=1`,
    etag: `etag-${pathname}`,
    pathname,
    size: 4,
    uploadedAt: new Date('2026-08-06T00:00:00.000Z'),
    url: blobUrl(pathname),
  }) satisfies HeadBlobResult & PutBlobResult;

const photo = () => new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' });
const avatar = () => new File([new Uint8Array(4)], 'bear.svg', { type: 'image/svg+xml' });

// Vercel blob is an external service — the one category these tests are allowed to stand in for.
// The real module is spread back in first because a lookup miss is narrowed with `instanceof
// BlobNotFoundError`, which a stubbed-out class would never satisfy.
vi.mock('@vercel/blob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vercel/blob')>()),
  del: vi.fn(async () => undefined),
  head: vi.fn(async (pathname: string) => storedBlob(pathname)),
  put: vi.fn(async (pathname: string) => storedBlob(pathname)),
}));

const { del, head, put } = await import('@vercel/blob');

// `mockReset`, not `mockClear`: a `*Once` implementation a test queued but never consumed would
// otherwise stay queued and fire in the next one, ahead of the defaults set here.
beforeEach(() => {
  vi.mocked(del)
    .mockReset()
    .mockImplementation(async () => undefined);
  vi.mocked(put)
    .mockReset()
    .mockImplementation(async (pathname: string) => storedBlob(pathname));
  vi.mocked(head).mockReset().mockRejectedValue(new BlobNotFoundError());
});

/** A resolved update whose commit/rollback just record that they ran. */
function trackedUpdate(value: string | null = blobUrl('pet-profiles/42/new.jpg')) {
  const commit = vi.fn(async () => undefined);
  const rollback = vi.fn(async () => undefined);

  return { commit, rollback, update: { changed: true, commit, rollback, value } satisfies ManagedImageUpdate };
}

describe('commitManagedImage', () => {
  it('should retire the old blob once the row is written', async () => {
    // GIVEN: a resolved picture change, whose replacement blob is already uploaded
    const { commit, rollback, update } = trackedUpdate();

    // WHEN: the write persists a row
    await expect(ImagesService.commitManagedImage(update, async () => true)).resolves.toBe(true);

    // THEN: the picture it replaced should be retired, and nothing rolled back
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('should roll the new upload back when the row vanished mid-request', async () => {
    // GIVEN: a resolved picture change, whose replacement blob is already uploaded
    const { commit, rollback, update } = trackedUpdate();

    // WHEN: the write matches no row, because another member deleted the profile
    await expect(ImagesService.commitManagedImage(update, async () => false)).resolves.toBe(false);

    // THEN: the fresh blob should be dropped rather than left as storage nothing points at
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('should roll back and re-throw when the write itself fails', async () => {
    // GIVEN: a resolved picture change and a write that throws
    const { commit, rollback, update } = trackedUpdate();
    const failure = new Error('connection lost');

    // WHEN: it is committed
    // THEN: the original error should reach the caller
    await expect(
      ImagesService.commitManagedImage(update, () => {
        throw failure;
      })
    ).rejects.toBe(failure);

    // THEN: and the fresh blob should be dropped on the way out
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('should still report whether the row persisted when no image changed', async () => {
    // GIVEN: a patch that touched no picture
    const unchanged: ManagedImageUpdate = { changed: false };

    // WHEN: it is committed
    // THEN: the write's own answer should pass through, so the caller can still 404
    await expect(ImagesService.commitManagedImage(unchanged, async () => true)).resolves.toBe(true);
    await expect(ImagesService.commitManagedImage(unchanged, async () => false)).resolves.toBe(false);
  });

  it('should run the write exactly once', async () => {
    const write = vi.fn(async () => true);

    await ImagesService.commitManagedImage({ changed: false }, write);

    expect(write).toHaveBeenCalledOnce();
  });

  it('should roll back a cleared picture that found no row', async () => {
    // GIVEN: a change that clears the column, so there is no new blob to drop
    const { commit, rollback, update } = trackedUpdate(null);

    // WHEN: the write matches no row
    await ImagesService.commitManagedImage(update, async () => false);

    // THEN: rollback should still run — it is what stops the old blob being retired for a write
    // that never happened
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('cleanupOwnedImage', () => {
  it('should delete a blob inside the owned namespace', async () => {
    await ImagesService.cleanupOwnedImage(blobUrl('pet-profiles/42/photo.jpg'), 'pet-profiles/42');

    expect(del).toHaveBeenCalledWith(blobUrl('pet-profiles/42/photo.jpg'), expect.anything());
  });

  it('should refuse to delete a shared avatar', async () => {
    // GIVEN: a blob in the shared avatars namespace, which several profiles can point at
    // WHEN: cleanup runs for a profile that owns a different namespace
    await ImagesService.cleanupOwnedImage(blobUrl('avatars/bear.svg'), 'pet-profiles/42');

    // THEN: it should be left alone, or every other profile using it loses its picture
    expect(del).not.toHaveBeenCalled();
  });

  it('should refuse to delete another entity type’s blob', async () => {
    await ImagesService.cleanupOwnedImage(blobUrl('child-profiles/7/photo.jpg'), 'pet-profiles/42');

    expect(del).not.toHaveBeenCalled();
  });

  it('should guard on the whole top-level segment, not a prefix of it', async () => {
    await ImagesService.cleanupOwnedImage(blobUrl('pet-profiles-archive/1/photo.jpg'), 'pet-profiles/42');

    expect(del).not.toHaveBeenCalled();
  });

  it('should delete a sibling entity’s blob within the same namespace', async () => {
    // Only the top segment is checked, deliberately — a rename moves a blob between ids.
    await ImagesService.cleanupOwnedImage(blobUrl('pet-profiles/99/photo.jpg'), 'pet-profiles/42');

    expect(del).toHaveBeenCalledOnce();
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a malformed URL', 'not-a-url'],
    ['a client-relative path', '/pet-profiles/42/photo.jpg'],
  ])('should do nothing and not throw for %s', async (_what, url) => {
    // GIVEN: a stored value that is not a usable blob URL, as legacy or hand-edited data can be
    // WHEN: cleanup runs
    // THEN: it should return quietly
    await expect(ImagesService.cleanupOwnedImage(url, 'pet-profiles/42')).resolves.toBeUndefined();

    expect(del).not.toHaveBeenCalled();
  });

  it('should swallow a storage failure rather than failing a committed request', async () => {
    // GIVEN: a blob store that rejects the delete
    vi.mocked(del).mockRejectedValueOnce(new Error('blob store unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // WHEN: cleanup runs, after the DB change has already committed
    // THEN: it should return quietly — throwing would report failure for something that succeeded
    await expect(
      ImagesService.cleanupOwnedImage(blobUrl('pet-profiles/42/photo.jpg'), 'pet-profiles/42')
    ).resolves.toBeUndefined();

    // THEN: and the orphaned blob should still be reported, since nothing else will notice it
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('resolveManagedImage', () => {
  const config = { ownedPrefix: 'pet-profiles/42' };

  it('should report no change when the payload mentions no picture', async () => {
    await expect(ImagesService.resolveManagedImage({}, blobUrl('old.jpg'), config)).resolves.toEqual({
      changed: false,
    });

    expect(put).not.toHaveBeenCalled();
  });

  it('should treat an unchanged URL string as no change', async () => {
    // GIVEN: a payload echoing back the URL already stored
    const existing = blobUrl('pet-profiles/42/photo.jpg');

    // WHEN: it is resolved
    // THEN: nothing should be treated as changed
    await expect(ImagesService.resolveManagedImage({ image: existing }, existing, config)).resolves.toEqual({
      changed: false,
    });
  });

  it('should clear the column when the field was blanked', async () => {
    // WHEN: a payload sends '' to clear the picture
    const update = await ImagesService.resolveManagedImage({ image: '' }, blobUrl('old.jpg'), config);

    // THEN: the new value should be null, with nothing uploaded
    expect(update).toMatchObject({ changed: true, value: null });
    expect(put).not.toHaveBeenCalled();
  });

  it('should upload a photo into the owned namespace', async () => {
    // WHEN: a profile with no picture is given one
    const update = await ImagesService.resolveManagedImage({ image: photo() }, null, config);

    // THEN: the blob should land under the entity's own prefix and become the new value
    expect(put).toHaveBeenCalledOnce();
    expect(vi.mocked(put).mock.calls[0]?.[0]).toBe('pet-profiles/42/photo.jpg');
    expect(update).toMatchObject({ changed: true, value: blobUrl('pet-profiles/42/photo.jpg') });
  });

  it('should leave the old blob alone until commit', async () => {
    // GIVEN: a profile that already has a picture
    // WHEN: a replacement is resolved
    await ImagesService.resolveManagedImage({ image: photo() }, blobUrl('pet-profiles/42/old.jpg'), config);

    // THEN: the old blob should still exist — it is retired only after the write, so a failed write
    // can never leave the row pointing at something already deleted
    expect(del).not.toHaveBeenCalled();
  });

  it('should reuse an existing shared avatar instead of uploading again', async () => {
    // GIVEN: the chosen avatar is already in the shared namespace
    vi.mocked(head).mockResolvedValue(storedBlob('avatars/bear.svg'));

    // WHEN: it is resolved
    const update = await ImagesService.resolveManagedImage({ avatar: avatar() }, null, config);

    // THEN: the existing blob should be reused, with no second upload
    expect(update).toMatchObject({ changed: true, value: blobUrl('avatars/bear.svg') });
    expect(put).not.toHaveBeenCalled();
  });

  it('should resolve a concurrent first upload to the winner’s blob rather than clobbering it', async () => {
    // GIVEN: two members pick the same new avatar at once, so the loser's no-overwrite put conflicts
    // and the blob exists by the time it looks again
    vi.mocked(put).mockRejectedValueOnce(new Error('blob already exists'));
    vi.mocked(head)
      .mockRejectedValueOnce(new BlobNotFoundError())
      .mockResolvedValueOnce(storedBlob('avatars/bear.svg'));

    // WHEN: the loser resolves its avatar
    const update = await ImagesService.resolveManagedImage({ avatar: avatar() }, null, config);

    // THEN: it should adopt the winner's blob — overwriting would swap the bytes underneath whoever
    // already points at it
    expect(update).toMatchObject({ changed: true, value: blobUrl('avatars/bear.svg') });
  });

  it('should re-throw when the upload failed for a reason other than a race', async () => {
    // GIVEN: an upload that fails with the blob still absent afterwards
    vi.mocked(put).mockRejectedValueOnce(new Error('blob store unavailable'));

    // WHEN: the avatar is resolved
    // THEN: the error should reach the caller rather than being read as a lost race
    await expect(ImagesService.resolveManagedImage({ avatar: avatar() }, null, config)).rejects.toThrow(
      'blob store unavailable'
    );
  });

  it('should roll a new photo back but leave a shared avatar in place', async () => {
    // GIVEN: an uploaded photo whose write is then abandoned
    const uploaded = await ImagesService.resolveManagedImage({ image: photo() }, null, config);

    // WHEN: the write matches no row
    await ImagesService.commitManagedImage(uploaded, async () => false);

    // THEN: the owned blob should be deleted
    expect(del).toHaveBeenCalledOnce();
    vi.mocked(del).mockClear();

    // GIVEN: the same, for a shared avatar rather than an uploaded photo
    const shared = await ImagesService.resolveManagedImage({ avatar: avatar() }, null, config);

    // WHEN: that write is abandoned too
    await ImagesService.commitManagedImage(shared, async () => false);

    // THEN: the avatar should survive — rollback goes through the same ownership guard, which is
    // what stops it removing a blob other profiles still use
    expect(del).not.toHaveBeenCalled();
  });
});
