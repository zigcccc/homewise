import { Hono } from 'hono';
import { z } from 'zod';

import { auth, forwardAuthCookies } from '#lib/auth';
import { blobPrefix } from '#lib/blobs';
import { zValidator } from '#lib/validation';
import { type AppContext } from '#types/app.type';

import { ImagesService } from '../images/images.service';

const usersApp = new Hono<AppContext>()
  .patch(
    '/me',
    zValidator(
      'form',
      z.object({
        image: z.union([z.file(), z.string().transform((val) => (val === '' ? undefined : val))]).optional(),
        name: z
          .string()
          .transform((val) => (val === '' ? undefined : val))
          .optional(),
      })
    ),
    async (c) => {
      const { user } = c.var;
      const { image, name } = c.req.valid('form');

      // The model above turns '' into undefined, so this never resolves to a clear — PATCH can only
      // replace a picture, and DELETE below is what removes one.
      const picture = await ImagesService.resolveManagedImage({ image }, user.image ?? null, {
        ownedPrefix: blobPrefix.userAvatar(user.id),
        size: 128,
      });

      // better-auth is the write here, and it throws rather than reporting a miss, so its own result
      // is what reports the update landed — and retires the picture this one replaced.
      let authHeaders: Headers | undefined;
      const result = await ImagesService.commitManagedImage(picture, async () => {
        const { headers, response } = await auth.api.updateUser({
          body: {
            // '' is how better-auth clears a column, so a resolved-to-null picture still would.
            image: picture.changed ? (picture.value ?? '') : undefined,
            name: name ?? user.name,
          },
          headers: c.req.raw.headers,
          returnHeaders: true,
        });

        authHeaders = headers;
        return response;
      });

      // Carries the rewritten session cache, or the client keeps rendering the old name and picture.
      if (authHeaders) {
        forwardAuthCookies(c, authHeaders);
      }

      return c.json(result, 200);
    }
  )
  .delete('/me/profile-picture', async (c) => {
    const { user } = c.var;
    if (!user.image) {
      return c.body(null, 204);
    }

    const { headers, response: result } = await auth.api.updateUser({
      body: { image: '' },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });

    forwardAuthCookies(c, headers);

    // After the write, and guarded: a storage hiccup must not fail a clear that already persisted,
    // and a picture that isn't ours to delete (a social login's, say) is left where it is.
    await ImagesService.cleanupOwnedImage(user.image, blobPrefix.userAvatar(user.id));

    return c.json(result, 202);
  });

export default usersApp;
