import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { ChildProfilesService } from './child-profiles.service';
import { childProfilePathParamsModel, createChildProfileModel, patchChildProfileModel } from './models';

/**
 * Per-child profiles — the hub record for a child (general info + attached sub-features like the
 * dictionary). Fully collaborative: any household member can create and manage a profile.
 */
const childProfilesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', async (c) => {
    const { household } = c.var;
    const profiles = await ChildProfilesService.list(household.id, household.ownerId);

    return c.json(profiles, 200);
  })
  .post('/', zValidator('json', createChildProfileModel), async (c) => {
    const { household } = c.var;
    const profile = await ChildProfilesService.create(household.id, c.req.valid('json'), household.ownerId);

    return c.json(profile, 201);
  })
  .get('/:id', zValidator('param', childProfilePathParamsModel), async (c) => {
    const { household } = c.var;
    const profile = await ChildProfilesService.read(household.id, c.req.valid('param').id, household.ownerId);

    return c.json(profile, 200);
  })
  .patch(
    '/:id',
    zValidator('param', childProfilePathParamsModel),
    zValidator('form', patchChildProfileModel),
    async (c) => {
      const { household } = c.var;
      const profile = await ChildProfilesService.patch(
        household.id,
        c.req.valid('param').id,
        c.req.valid('form'),
        household.ownerId
      );

      return c.json(profile, 200);
    }
  )
  .delete('/:id', zValidator('param', childProfilePathParamsModel), async (c) => {
    await ChildProfilesService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

export default childProfilesApp;
