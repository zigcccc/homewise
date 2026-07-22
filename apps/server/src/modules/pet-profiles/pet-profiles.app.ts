import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { createPetProfileModel, patchPetProfileModel, petProfilePathParamsModel } from './models';
import { PetProfilesService } from './pet-profiles.service';

/**
 * Per-pet profiles — the hub record for a pet (general info + attached sub-features to come).
 * Fully collaborative: any household member can create and manage a profile.
 */
const petProfilesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', async (c) => {
    const { household } = c.var;
    const profiles = await PetProfilesService.list(household.id, household.ownerId);

    return c.json(profiles, 200);
  })
  .post('/', zValidator('json', createPetProfileModel), async (c) => {
    const { household } = c.var;
    const profile = await PetProfilesService.create(household.id, c.req.valid('json'), household.ownerId);

    return c.json(profile, 201);
  })
  .get('/:id', zValidator('param', petProfilePathParamsModel), async (c) => {
    const { household } = c.var;
    const profile = await PetProfilesService.read(household.id, c.req.valid('param').id, household.ownerId);

    return c.json(profile, 200);
  })
  .patch(
    '/:id',
    zValidator('param', petProfilePathParamsModel),
    zValidator('form', patchPetProfileModel),
    async (c) => {
      const { household } = c.var;
      const profile = await PetProfilesService.patch(
        household.id,
        c.req.valid('param').id,
        c.req.valid('form'),
        household.ownerId
      );

      return c.json(profile, 200);
    }
  )
  .delete('/:id', zValidator('param', petProfilePathParamsModel), async (c) => {
    await PetProfilesService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

export default petProfilesApp;
