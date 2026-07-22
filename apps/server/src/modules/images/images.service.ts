import { del, list, put } from '@vercel/blob';
import sharp from 'sharp';

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
  private static token = process.env.HOMEWISE_FILES_READ_WRITE_TOKEN;

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
    const image = await put(path, resizedImage, {
      access: 'public',
      token: ImagesService.token,
      addRandomSuffix: true,
    });

    return image;
  }

  public static async delete(path: string) {
    return await del(path, { token: ImagesService.token });
  }

  /** Looks up an existing blob by its exact pathname, returning its public URL (or null). */
  public static async find(pathname: string) {
    const { blobs } = await list({ prefix: pathname, token: ImagesService.token });
    return blobs.find((blob) => blob.pathname === pathname)?.url ?? null;
  }

  /**
   * Uploads to a deterministic pathname (no random suffix), so the same logical asset always lands at
   * the same URL. Used for shared, deduplicated blobs like the default avatars.
   */
  public static async putStable(pathname: string, body: string | Buffer, contentType: string) {
    const { url } = await put(pathname, body, {
      access: 'public',
      token: ImagesService.token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });

    return url;
  }

  /**
   * Uploads a client-provided shared asset at a deterministic path, reusing the existing blob when one
   * is already there (dedup by pathname). Shared blobs are written at most once and never deleted; the
   * filename that keys them is validated as a safe path segment by the calling module's request model.
   */
  public static async putShared(pathname: string, file: File) {
    const existing = await ImagesService.find(pathname);
    if (existing) {
      return existing;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    return ImagesService.putStable(pathname, bytes, file.type || 'image/svg+xml');
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

    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return;
    }

    const ownedRoot = `/${ownedPrefix.split('/')[0]}/`;
    if (!pathname.startsWith(ownedRoot)) {
      return;
    }

    try {
      await ImagesService.delete(url);
    } catch (error) {
      console.error('Failed to clean up managed image blob', error);
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
   * Runs the caller's DB write as the commit point for a resolved managed image: on success the old
   * blob is retired, on failure the freshly uploaded one is rolled back and the error re-thrown.
   */
  public static async commitManagedImage(update: ManagedImageUpdate, write: () => PromiseLike<unknown>) {
    try {
      await write();
    } catch (error) {
      if (update.changed) {
        await update.rollback();
      }
      throw error;
    }

    if (update.changed) {
      await update.commit();
    }
  }
}
