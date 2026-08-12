---
name: working-with-images-on-server
description: How image/file uploads work on the Homewise server — the ImagesService "managed image field" architecture (owned vs shared blob namespaces, upload-before-write ordering with rollback, avatar dedup, ownership-guarded cleanup). Use when adding or changing any server-side image/photo/avatar/file upload, storing a blob-URL column, wiring a picture field into a service's patch/delete, or debugging orphaned/duplicated/deleted blobs.
---

# Working with images on the server

All server-side uploads go through **`ImagesService`** (`apps/server/src/modules/images/images.service.ts`)
and are stored on **Vercel blob**. This skill is the architecture behind that service. Read `CLAUDE.md`
first — it wins on any conflict.

Files come in as multipart via `zValidator('form', …)` (see `users.app.ts` `/me`); on the web send
them through the RPC client's `form` field.

Reference implementations: `child-profiles.service.ts` and `pet-profiles.service.ts` (both use the
managed-image API end to end) and their `patch*ProfileModel` request models.

## Core concepts

### The blob URL is the source of truth
The persisted column (e.g. `profilePicture`) stores a **full `https://…blob.vercel-storage.com/…`
URL**, never a client-relative path like `/avatars/x.svg`. This keeps the value portable across clients
(web today, a mobile app later) — no client's bundled assets are load-bearing.

### Two namespaces, two lifecycles
Every blob lives in exactly one of these, distinguished by its path prefix:

| | **Owned** (per-entity) | **Shared** (deduplicated) |
|---|---|---|
| Path | `<entity>/<id>/<name>` e.g. `pet-profiles/42/photo.jpg` | `<sharedPrefix>/<filename>` e.g. `avatars/avatar-pet-dog.svg` |
| Suffix | `addRandomSuffix: true` (unique per upload) | `addRandomSuffix: false` (deterministic) |
| Resized | yes (`size`/`width`+`height`) | no — stored as-is |
| Deleted? | **yes** — disposable; replaced/cleared blobs are cleaned up | **never** — many rows may point at one |
| Uploaded | every time | at most once (dedup by pathname) |

**The ownership guard is what keeps these safe:** cleanup only ever deletes a blob whose pathname is
under the owning entity's top-level namespace (`/pet-profiles/…`). A shared `/avatars/…` blob is guarded
out, so retiring one pet's picture can never delete an avatar another pet still uses.

### The client owns which client-provided assets exist; the server only dedups + sanitizes
Don't bundle avatars/assets on the server, prepopulate storage, or add a "list assets" endpoint. The
client bundles them and uploads the chosen bytes; the server stores/dedups whatever arrives. When an
upload's **filename doubles as the storage-path key** (the dedup identity, as avatars do), the request
model must validate it as a safe path segment so a crafted name can't escape the folder or overwrite
another blob — see the request-model contract below.

## The managed-image API

A **managed image field** is a single blob-URL column driven by a photo/avatar/clear payload. This is
the common case (profile pictures); use the high-level API rather than hand-rolling `put`/`find`/`delete`.

```ts
export type ManagedImagePayload = { image?: File | string; avatar?: File };
export type ManagedImageConfig  = { ownedPrefix: string; size?: number; sharedPrefix?: string };
```

- `image` is a `File` → **upload a personal photo** (owned namespace, resized).
- `image` is `''` → **clear** the picture (column becomes `null`).
- `avatar` is a `File` → **pick a shared avatar** (deduped under `sharedPrefix`, default `avatars`).
- neither present (`undefined`, or an unchanged URL string) → **no change**.

### `resolveManagedImage(payload, existingUrl, config) → ManagedImageUpdate`
Uploads the replacement blob **up front** and returns either `{ changed: false }` or
`{ changed: true, value, commit, rollback }`, where `value` is the new column value (`string` URL or
`null`). It does **not** touch the old blob yet.

### `commitManagedImage(update, write) → the write's own result`
Runs the caller's DB `write` as the **commit point**. `write` must report what it actually
**persisted**, and anything falsy means nothing was (do `.returning({ id })` and return `Boolean(row)`):
- write returns something **truthy** → the old blob is retired (best-effort, guarded).
- write returns something **falsy** → the row vanished (e.g. a **concurrent delete**), so the update
  touched nothing and the new upload would be orphaned. It's rolled back → the caller throws 404.
- write **throws** → the freshly uploaded blob is rolled back and the error re-thrown.

The write's result comes straight back, so a caller that needs the record it just wrote (`users.app.ts`
returns better-auth's updated user) reads it from the return value. Don't smuggle it out through a
`let` the closure assigns.

This ordering (upload → DB write → retire-old / rollback-new) is why a failed *or* no-op update can never
leave the row pointing at a deleted blob or orphan the new upload, and a shared avatar is never rolled back.

### `cleanupOwnedImage(url, ownedPrefix)`
Best-effort, ownership-guarded deletion — used by `commit`/`rollback` internally, and directly in a
service's `delete` after the row is gone. Never throws (a storage hiccup must not fail a delete that
already succeeded) and never deletes outside `ownedPrefix`'s top-level namespace.

### Lower-level building blocks (rarely needed directly)
`put(file, path, options?)`, `delete(path)`, `find(pathname)`, `putStable(pathname, body, contentType)`,
`putShared(pathname, file)`. Reach for these only for a shape the managed API doesn't cover (e.g. a
gallery of many images on one row) — and if you find yourself re-deriving the guard/ordering, extend
`ImagesService` instead of copying logic into a domain service.

## Two backends, one seam (`images.store.ts`)

`ImagesService` never touches `@vercel/blob`. Everything goes through `imageStore`
(`apps/server/src/modules/images/images.store.ts`), an `ImageStore` interface with two classes
implementing it, one of which is picked at boot:

- **`VercelStore`** — the real thing. Used in production and in `pnpm dev`.
- **`LocalStore`** — writes under `os.tmpdir()/homewise-files` and hands out
  `http://localhost:<SERVER_PORT>/files/<pathname>` URLs, which `index.ts` serves via `localStore.read`
  from a route registered **before** the session guard (an `<img>` from another origin sends no
  cookies). Selected by `HOMEWISE_LOCAL_FILE_STORAGE`, which `env.ts` refuses outside `NODE_ENV`
  development/test. The port comes from `#config/server` — the store and `serve()` must agree, or
  every stored picture 404s.

**Why it exists:** Vercel bills `put`, `copy` and `list` as *advanced operations* — 2K/month, and
exceeding it locks uploads out for the rest of the window. The E2E suite spent three per run on a
103-byte fixture. `apps/e2e/playwright.config.ts` sets the flag, so the suite now needs no blob
credential at all (nor does CI). `del` is free, and `head` is billed as the far cheaper *simple*
operation — which is why `find` is a `head` lookup and not a `list`.

Adding a store operation means adding it to the interface and **both** classes. `LocalStore` deliberately mirrors
Vercel's semantics rather than approximating them — `addRandomSuffix` really does produce a distinct
pathname, and a no-overwrite write really does fail when the pathname is taken (`wx`), because
`putShared`'s race handler catches exactly that. It also refuses any pathname that resolves outside
its root: `image` filenames are client-controlled (only `avatar` has the filename refine), so on a
real filesystem that's a traversal.

## Recipe: add a managed picture to an entity

1. **Schema** — add a nullable `text('...')` column for the blob URL (e.g. `profilePicture`).
2. **Request model** — accept the multipart payload. Copy the `image` + `avatar` fields from
   `patchPetProfileModel`:
   - `image: z.union([z.file(), z.string()]).optional()`
   - `avatar: z.file().mime([...]).max(1024 * 1024).refine(f => /^[a-z0-9-]+\.[a-z0-9]+$/.test(f.name), …).optional()`
     — the `refine` is the filename-as-key sanitization; **do not omit it** for deduped assets.
3. **App route** — validate with `zValidator('form', …)` (multipart), like `users.app.ts` `/me`.
4. **Service `patch`**:
   ```ts
   const picture = await ImagesService.resolveManagedImage(
     { image: data.image, avatar: data.avatar },
     existing.profilePicture,
     { ownedPrefix: `<entity>/${id}`, size: 256 },
   );
   if (picture.changed) patch.profilePicture = picture.value;

   const persisted = await ImagesService.commitManagedImage(picture, async () => {
     const [row] = await db.update(schema.<table>).set(patch).where(and(...)).returning({ id: schema.<table>.id });
     return Boolean(row);
   });
   if (!persisted) throw new HTTPException(404, { message: 'Profile not found' }); // vanished mid-write
   ```
5. **Service `delete`** — after the row is removed:
   ```ts
   await ImagesService.cleanupOwnedImage(deleted.profilePicture, `<entity>/${id}`);
   ```
6. **Web** — send files through the RPC client's `form` field; resolve photo → avatar → clear on the
   client to match the server (see `family/pets/$profileId/general.tsx`).

## Rules & gotchas

- **A store must be configured** — `HOMEWISE_FILES_READ_WRITE_TOKEN` unless `HOMEWISE_LOCAL_FILE_STORAGE`
  is on, enforced by a refine in `src/config/env.ts` and read through `env`, never off `process.env`,
  so the server refuses to boot with neither exactly like `DATABASE_URL` and the Ably key. Every
  profile picture and kid/pet photo goes through it; unvalidated, a missing token booted fine and then
  surfaced as an opaque storage-SDK error on the first upload, far from the cause.
- **Never store a client-relative path.** Always the blob URL — never `/some-asset.svg` pointing at
  one app's bundled assets.
- **`ownedPrefix` must be unique per entity type** and must **never be `avatars/…`** (`pet-profiles`,
  `child-profiles`, `user-avatars`, …) — its first segment is the ownership guard. Two entity types
  sharing a prefix would let one delete the other's blobs, and an owned prefix under `avatars/` would
  put every shared, never-deleted avatar inside somebody's cleanup namespace. That is exactly why user
  avatars moved from `avatars/<userId>` to `blobPrefix.userAvatar` — blobs written under the old path
  keep working and are simply never retired.
- **Shared assets are immutable and eternal** — never delete an `avatars/…` blob, never `put` over one
  with random suffixes. `putShared` (find-or-`putStable`) is the only way to write them.
- **Cleanups after a committed DB change are best-effort** — they log (`console.error`) and swallow, so
  storage flakiness can't fail an operation that already persisted. Don't `throw` from them.
- **Don't split the two phases across a DB write yourself.** Always pass the write to
  `commitManagedImage`; putting the `db.update` outside it reintroduces the ordering bug the API exists
  to prevent.
- **Adding a genuinely new shape?** Extend `ImagesService`, don't reimplement blob lifecycle in a domain
  service. Keeping this logic in one place is the whole point of the abstraction.
