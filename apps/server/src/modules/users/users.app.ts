import { Hono } from 'hono';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { zValidator } from '@/lib/validation';
import { type AppContext } from '@/types/app.type';

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

      let imageUrl: string | undefined = undefined;

      if (image instanceof File) {
        const { url } = await ImagesService.put(image, `avatars/${user.id}/${image.name}`, { size: 128 });
        imageUrl = url;
      }

      const result = await auth.api.updateUser({
        body: {
          image: imageUrl,
          name: name ?? user.name,
        },
        headers: c.req.raw.headers,
      });

      return c.json(result, 200);
    }
  )
  .delete('/me/profile-picture', async (c) => {
    if (!c.var.user.image) {
      return c.body(null, 204);
    }

    await ImagesService.delete(c.var.user.image);
    const result = await auth.api.updateUser({ body: { image: '' }, headers: c.req.raw.headers });

    return c.json(result, 202);
  });

export default usersApp;
