import { captureException } from '@sentry/hono/node';
import sharp from 'sharp';

import { imageStore } from './images.store';

type PutImageOptions =
  | {
      width: number;
      height: number;
    }
  | {
      size: number;
    };

/**
 * Payload for a managed profile-picture field, mirroring the multipart form the clients send: a `File`
 * on `image` uploads a personal photo; `image: ''` clears it; a `File` on `avatar` picks a shared,
 * deduplicated avatar (its filename is the dedup key). Anything else (`undefined`, an unchanged URL
 * string) means "no change".
 */
export type ManagedImagePayload = {
  image?: File | string;
  avatar?: File;
};

/**
 * How a managed picture is stored. `ownedPrefix` is the entity's private namespace (e.g.
 * `pet-profiles/42`) — the only blobs cleanup will ever delete; `size` resizes personal photos; shared
 * avatars live under `sharedPrefix` (default `avatars`) and are never deleted.
 */
export type ManagedImageConfig = {
  ownedPrefix: string;
  size?: number;
  sharedPrefix?: string;
};

/**
 * The outcome of resolving a {@link ManagedImagePayload}. When `changed`, `value` is the new column
 * value (a blob URL, or `null` when cleared); `commit`/`rollback` manage the old-vs-new blob lifecycle
 * around the caller's DB write and are driven by {@link ImagesService.commitManagedImage}.
 */
export type ManagedImageUpdate =
  | { changed: false }
  | { changed: true; value: string | null; commit: () => Promise<void>; rollback: () => Promise<void> };

export class ImagesService {
  private static async resizeImage(file: File, width: number, height: number) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  public static async put(file: File, path: string, options?: PutImageOptions) {
    const resizedImage = options
      ? await ImagesService.resizeImage(
          file,
          'size' in options ? options.size : options.width,
          'size' in options ? options.size : options.height
        )
      : file;
    return await imageStore.put(path, resizedImage, { addRandomSuffix: true });
  }

  public static async delete(path: string) {
    return await imageStore.remove(path);
  }

  /** Looks up an existing blob by its exact pathname, returning its public URL (or null). */
  public static async find(pathname: string) {
    return await imageStore.find(pathname);
  }

  /**
   * Uploads to a deterministic pathname (no random suffix), so the same logical asset always lands at
   * the same URL. Used for shared, deduplicated blobs like the default avatars. `allowOverwrite`
   * defaults to `true` (replace in place); pass `false` for an atomic create-if-absent that throws
   * when the pathname already exists.
   */
  public static async putStable(
    pathname: string,
    body: string | Buffer,
    contentType: string,
    { allowOverwrite = true }: { allowOverwrite?: boolean } = {}
  ) {
    const { url } = await imageStore.put(pathname, body, { addRandomSuffix: false, allowOverwrite, contentType });

    return url;
  }

  /**
   * Uploads a client-provided shared asset at a deterministic path, reusing the existing blob when one
   * is already there (dedup by pathname). Shared blobs are written at most once and never deleted; the
   * filename that keys them is validated as a safe path segment by the calling module's request model.
   *
   * The write is a no-overwrite create, so two concurrent first uploads can't both replace the blob:
   * the loser's `put` conflicts, and we resolve it to the winner's URL rather than clobbering it.
   */
  public static async putShared(pathname: string, file: File) {
    const existing = await ImagesService.find(pathname);
    if (existing) {
      return existing;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      return await ImagesService.putStable(pathname, bytes, file.type || 'image/svg+xml', { allowOverwrite: false });
    } catch (error) {
      // A concurrent upload created it between our `find` and `put` — reuse that blob, don't overwrite.
      const raced = await ImagesService.find(pathname);
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  /**
   * Best-effort, ownership-guarded deletion. Removes a blob only when it lives in `ownedPrefix`'s
   * top-level namespace (never a shared avatar another entity may point at), and never throws — for
   * cleanups that run *after* the authoritative DB change has committed, where a storage hiccup must
   * not surface as a request error.
   */
  public static async cleanupOwnedImage(url: string | null, ownedPrefix: string) {
    if (!url) {
      return;
    }

    // Asking the store, rather than reading the URL here: the guard knows namespaces, and only the
    // store knows how one of its own URLs maps back to a pathname.
    const pathname = imageStore.pathnameOf(url);
    if (!pathname?.startsWith(`${ownedPrefix.split('/')[0]}/`)) {
      return;
    }

    try {
      await ImagesService.delete(url);
    } catch (error) {
      // Worth an issue rather than just a log line: an orphaned blob is storage we keep paying for
      // and nothing else will ever notice it.
      console.error('Failed to clean up managed image blob', error);
      captureException(error, { tags: { blobPrefix: ownedPrefix } });
    }
  }

  /**
   * Resolves a managed profile-picture payload into the new column value, uploading the replacement
   * blob up front. The old blob is not touched yet: {@link commitManagedImage} retires it only after
   * the caller's DB write succeeds (and rolls the new upload back if it fails), so the record can never
   * be left pointing at a blob that was already deleted.
   */
  public static async resolveManagedImage(
    payload: ManagedImagePayload,
    existingUrl: string | null,
    config: ManagedImageConfig
  ): Promise<ManagedImageUpdate> {
    const { ownedPrefix, size, sharedPrefix = 'avatars' } = config;

    let value: string | null;
    if (payload.image instanceof File) {
      const { url } = await ImagesService.put(
        payload.image,
        `${ownedPrefix}/${payload.image.name}`,
        size ? { size } : undefined
      );
      value = url;
    } else if (payload.avatar instanceof File) {
      value = await ImagesService.putShared(`${sharedPrefix}/${payload.avatar.name}`, payload.avatar);
    } else if (payload.image === '') {
      value = null;
    } else {
      return { changed: false };
    }

    return {
      changed: true,
      value,
      // The previous picture is retired only once the DB points at the replacement.
      commit: () => ImagesService.cleanupOwnedImage(existingUrl, ownedPrefix),
      // A failed write drops the freshly uploaded blob (a shared avatar is guarded out, so it stays).
      rollback: () => ImagesService.cleanupOwnedImage(value, ownedPrefix),
    };
  }

  /**
   * Runs the caller's DB write as the commit point for a resolved managed image. `write` must report
   * what it persisted, and anything falsy means it persisted nothing: on a truthy result the old blob
   * is retired; on a falsy one (the row vanished, e.g. a concurrent delete, so the update touched
   * nothing) or a thrown error the freshly uploaded blob is rolled back so it isn't orphaned — the
   * error is re-thrown. The write's own result comes back, so a caller can 404 a vanished target off
   * a `Boolean(row)` or read the record it just wrote.
   */
  public static async commitManagedImage<T>(update: ManagedImageUpdate, write: () => PromiseLike<T>) {
    let persisted: T;
    try {
      persisted = await write();
    } catch (error) {
      if (update.changed) {
        await update.rollback();
      }
      throw error;
    }

    if (!persisted) {
      if (update.changed) {
        await update.rollback();
      }
      return persisted;
    }

    if (update.changed) {
      await update.commit();
    }

    return persisted;
  }
}
