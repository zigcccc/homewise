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
}
