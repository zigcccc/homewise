import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { localStore, readLocalFile } from '#modules/images/images.store';

// Namespaced per run so a concurrent E2E suite or `pnpm dev` writing into the same root can't be
// mistaken for this file's own state.
const PREFIX = `store-tests/${randomUUID()}`;

const bytes = () => Buffer.from([1, 2, 3, 4]);

afterAll(async () => {
  await rm(path.join(tmpdir(), 'homewise-files', 'store-tests'), { force: true, recursive: true });
});

describe('localStore.put', () => {
  it('should refuse a pathname that escapes the store root', async () => {
    // GIVEN: an upload whose filename walks out of its namespace — `image` carries no filename
    // refine (only shared avatars do), so this is client-controlled input
    // WHEN: it is stored
    // THEN: it should be rejected rather than written somewhere on the disk we don't own
    await expect(localStore.put(`${PREFIX}/../../../escaped.png`, bytes(), { addRandomSuffix: false })).rejects.toThrow(
      /outside the local file store/
    );
  });

  it('should fail the second no-overwrite write to the same pathname', async () => {
    // GIVEN: a shared avatar already written at its deterministic pathname
    const pathname = `${PREFIX}/bear.svg`;
    await localStore.put(pathname, bytes(), { addRandomSuffix: false, allowOverwrite: false });

    // WHEN: a concurrent pick writes the same pathname
    // THEN: it should lose rather than clobber — `putShared` resolves the race by catching exactly
    // this, and a store that overwrote instead would swap the bytes under everyone pointing at it
    await expect(
      localStore.put(pathname, bytes(), { addRandomSuffix: false, allowOverwrite: false })
    ).rejects.toThrow();
  });

  it('should overwrite in place when asked to', async () => {
    const pathname = `${PREFIX}/replaceable.png`;
    await localStore.put(pathname, bytes(), { addRandomSuffix: false, allowOverwrite: true });

    await expect(
      localStore.put(pathname, bytes(), { addRandomSuffix: false, allowOverwrite: true })
    ).resolves.toMatchObject({ pathname });
  });

  it('should keep two uploads of the same filename apart', async () => {
    // GIVEN: two owned photos uploaded under one entity, both named photo.jpg
    const first = await localStore.put(`${PREFIX}/photo.jpg`, bytes(), { addRandomSuffix: true });
    const second = await localStore.put(`${PREFIX}/photo.jpg`, bytes(), { addRandomSuffix: true });

    // THEN: each should land at its own pathname, extension intact, or replacing one picture would
    // silently change the other's
    expect(first.pathname).not.toBe(second.pathname);
    expect(first.pathname).toMatch(/^store-tests\/.+\/photo-[0-9a-f]{12}\.jpg$/);
  });
});

describe('localStore.find', () => {
  it('should report a stored blob and an absent one apart', async () => {
    const { pathname } = await localStore.put(`${PREFIX}/found.png`, bytes(), { addRandomSuffix: false });

    await expect(localStore.find(pathname)).resolves.toBe(`http://localhost:5173/files/${pathname}`);
    await expect(localStore.find(`${PREFIX}/never-written.png`)).resolves.toBeNull();
  });
});

describe('localStore.pathnameOf', () => {
  it('should round-trip a URL it handed out back to the pathname it stored', async () => {
    // GIVEN: a stored photo, whose URL is what the DB column holds
    const { pathname, url } = await localStore.put(`${PREFIX}/round-trip.png`, bytes(), { addRandomSuffix: false });

    // THEN: the URL should read back as the store pathname, `/files/` and all removed. The ownership
    // guard matches this against the owned prefix, so a URL that doesn't round-trip cleanly makes
    // every cleanup a silent no-op — deletes stop happening and nothing reports it.
    expect(localStore.pathnameOf(url)).toBe(pathname);
    expect(localStore.pathnameOf(url)?.startsWith('store-tests/')).toBe(true);
  });

  it.each([
    ['a Vercel URL', 'https://blob.vercel-storage.com/pet-profiles/1/photo.jpg'],
    ['a social login avatar', 'https://lh3.googleusercontent.com/a/abc123'],
    ['a client-relative path', '/pet-profiles/42/photo.jpg'],
  ])('should not claim %s', (_what, url) => {
    expect(localStore.pathnameOf(url)).toBeNull();
  });
});

describe('localStore.remove', () => {
  it('should delete a stored blob by the URL it handed out', async () => {
    const { pathname, url } = await localStore.put(`${PREFIX}/doomed.png`, bytes(), { addRandomSuffix: false });

    await localStore.remove(url);

    await expect(localStore.find(pathname)).resolves.toBeNull();
  });

  it.each([
    ['an already-deleted blob', `${PREFIX}/gone.png`],
    ['a Vercel URL from before the flag was on', 'https://blob.vercel-storage.com/pet-profiles/1/photo.jpg'],
    ['a social login avatar', 'https://lh3.googleusercontent.com/a/abc123'],
  ])('should quietly do nothing for %s', async (_what, url) => {
    // Cleanups run after the DB change has committed, so nothing here may throw.
    await expect(localStore.remove(url)).resolves.toBeUndefined();
  });
});

describe('readLocalFile', () => {
  it('should serve a stored blob with a content type derived from its extension', async () => {
    const { pathname } = await localStore.put(`${PREFIX}/served.png`, bytes(), { addRandomSuffix: false });

    await expect(readLocalFile(pathname)).resolves.toEqual({ body: bytes(), contentType: 'image/png' });
  });

  it('should refuse to read outside the store root', async () => {
    // GIVEN: a real file just outside the root. It has to exist and be reachable, or the assertion
    // would pass on a plain ENOENT and prove nothing about the guard.
    const outside = path.join(tmpdir(), `homewise-outside-${randomUUID()}.png`);
    await writeFile(outside, bytes());

    // WHEN: a crafted URL walks out to it — the route hands this whatever followed /files/
    // THEN: it should be refused; the guard is all that stands between that URL and the disk
    await expect(readLocalFile(`../${path.basename(outside)}`)).resolves.toBeNull();

    await rm(outside, { force: true });
  });

  it('should return null for a path that was never written', async () => {
    await expect(readLocalFile(`${PREFIX}/missing.png`)).resolves.toBeNull();
  });
});
