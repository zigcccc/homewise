import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { childProfilePathParamsModel, createChildProfileModel, patchChildProfileModel } from './child-profiles.model';
import { ChildProfilesService } from './child-profiles.service';

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

    c.var.emit({ entity: 'child_profile', id: profile.id, operation: 'create' });

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

      c.var.emit({ entity: 'child_profile', id: profile.id, operation: 'update' });

      return c.json(profile, 200);
    }
  )
  .delete('/:id', zValidator('param', childProfilePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await ChildProfilesService.delete(c.var.household.id, id);

    c.var.emit({ entity: 'child_profile', id, operation: 'delete' });

    return c.json({ success: true }, 202);
  });

export default childProfilesApp;
