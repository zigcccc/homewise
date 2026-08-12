import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BlobNotFoundError, del, head, put } from '@vercel/blob';

import { env } from '#config/env';
import { SERVER_PORT } from '#config/server';

type StoredBlob = { pathname: string; url: string };

type PutOptions = { addRandomSuffix: boolean; allowOverwrite?: boolean; contentType?: string };

/**
 * Where uploaded bytes live. Two backends, one seam: Vercel blob in production, a local directory
 * this process serves under E2E. Everything above this file — `ImagesService` and the managed-image
 * API — is written against this interface and knows about neither.
 */
interface ImageStore {
  put(pathname: string, body: Buffer | File | string, options: PutOptions): Promise<StoredBlob>;
  remove(urlOrPathname: string): Promise<void>;
  find(pathname: string): Promise<string | null>;
  /**
   * The store pathname a URL of ours refers to, or null when it isn't one — an external avatar, a
   * malformed value, a URL from the other driver. The ownership guard is written against store
   * pathnames, and only the store that minted a URL knows how to read one back.
   */
  pathnameOf(url: string): string | null;
}

class VercelStore implements ImageStore {
  async put(pathname: string, body: Buffer | File | string, options: PutOptions) {
    const blob = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: options.addRandomSuffix,
      allowOverwrite: options.allowOverwrite,
      contentType: options.contentType,
      token: env.HOMEWISE_FILES_READ_WRITE_TOKEN,
    });

    return { pathname: blob.pathname, url: blob.url };
  }

  async remove(urlOrPathname: string) {
    await del(urlOrPathname, { token: env.HOMEWISE_FILES_READ_WRITE_TOKEN });
  }

  // `head` rather than `list`: both answer "is this exact pathname there?", but Vercel bills `list`
  // as an advanced operation and `head` as a simple one — a quota five times larger.
  async find(pathname: string) {
    try {
      const { url } = await head(pathname, { token: env.HOMEWISE_FILES_READ_WRITE_TOKEN });
      return url;
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  // A blob URL carries its pathname directly, so there is nothing to strip but the leading slash.
  pathnameOf(url: string) {
    return URL.canParse(url) ? new URL(url).pathname.replace(/^\//, '') : null;
  }
}

const LOCAL_ROOT = path.join(tmpdir(), 'homewise-files');
const LOCAL_BASE_URL = `http://localhost:${SERVER_PORT}/files`;

/** The mime types the request models accept, plus the JPEG sharp re-encodes owned photos into. */
const localContentTypes: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

async function toBuffer(body: Buffer | File | string) {
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  return Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer());
}

function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Mirrors Vercel's `addRandomSuffix`: unique per upload, extension preserved. */
function withRandomSuffix(pathname: string) {
  const extension = path.extname(pathname);
  return `${pathname.slice(0, pathname.length - extension.length)}-${randomBytes(6).toString('hex')}${extension}`;
}

class LocalStore implements ImageStore {
  /** Resolves a blob pathname under the local root, returning null for anything that escapes it. */
  private resolve(pathname: string) {
    const resolved = path.resolve(LOCAL_ROOT, pathname);
    return resolved.startsWith(`${LOCAL_ROOT}${path.sep}`) ? resolved : null;
  }

  async put(pathname: string, body: Buffer | File | string, options: PutOptions) {
    const stored = options.addRandomSuffix ? withRandomSuffix(pathname) : pathname;
    const file = this.resolve(stored);
    if (!file) {
      throw new Error(`Refusing to write outside the local file store: ${stored}`);
    }

    await mkdir(path.dirname(file), { recursive: true });
    // `wx` is what makes a no-overwrite write atomic. `putShared` resolves its create-if-absent race
    // by catching the write that lost, so this store has to fail the same way rather than pre-check.
    await writeFile(file, await toBuffer(body), { flag: options.allowOverwrite ? 'w' : 'wx' });

    return { pathname: stored, url: `${LOCAL_BASE_URL}/${stored}` };
  }

  async remove(urlOrPathname: string) {
    // Rows written before the flag was on — and any external URL, like a social login's avatar —
    // point somewhere this store doesn't own. Nothing to remove.
    const pathname = URL.canParse(urlOrPathname) ? this.pathnameOf(urlOrPathname) : urlOrPathname;
    const file = pathname === null ? null : this.resolve(pathname);
    if (!file) {
      return;
    }

    try {
      await unlink(file);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  async find(pathname: string) {
    const file = this.resolve(pathname);
    if (!file) {
      return null;
    }

    try {
      await stat(file);
      return `${LOCAL_BASE_URL}/${pathname}`;
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  // Our URLs are the store root behind a `/files/` route, so that prefix comes back off.
  pathnameOf(url: string) {
    return url.startsWith(`${LOCAL_BASE_URL}/`) ? url.slice(LOCAL_BASE_URL.length + 1) : null;
  }

  /** Reads a stored file for the `/files/*` route, or null when it isn't there. */
  async read(pathname: string) {
    const file = this.resolve(pathname);
    if (!file) {
      return null;
    }

    try {
      // Lower-cased because only shared avatars have their filename refined; an `image` keeps
      // whatever the client called it, `.PNG` included.
      return { body: await readFile(file), contentType: localContentTypes[path.extname(pathname).toLowerCase()] };
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }
}

export const localStore = new LocalStore();

export const imageStore = env.HOMEWISE_LOCAL_FILE_STORAGE ? localStore : new VercelStore();
