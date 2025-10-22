import { put, del } from '@vercel/blob';
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
}
