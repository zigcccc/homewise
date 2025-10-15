import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { type AppContext } from '@/types/app.type';

import { ErrorsService } from '../errors/errors.service';

import { HouseholdsService } from './households.service';
import {
  acceptHouseholdInvitePathParamsModel,
  acceptHouseholdInviteQueryParamsModel,
  createHouseholdModel,
  inviteHouseholdMembersModel,
  inviteHouseholdMembersQueryParamsModel,
  readHouseholdInviteQueryParamsModel,
  readHouseholdPathParamsModel,
} from './models';

const householdsApp = new Hono<AppContext>()
  .get('/my', async (c) => {
    const household = await HouseholdsService.readForUser(c.var.user.id, { includeMembers: true });
    if (!household) {
      return c.body(null, 404);
    }
    return c.json(household, 200);
  })
  .get('/invite', zValidator('query', readHouseholdInviteQueryParamsModel), async (c) => {
    const { token } = c.req.valid('query');

    const invite = await HouseholdsService.readInvite(token);

    if (!invite) {
      return c.body(null, 404);
    }

    return c.json(invite, 200);
  })
  .post(
    '/invite/:id/accept',
    zValidator('param', acceptHouseholdInvitePathParamsModel),
    zValidator('query', acceptHouseholdInviteQueryParamsModel),
    async (c) => {
      const { token } = c.req.valid('query');
      const { id } = c.req.valid('param');

      await HouseholdsService.acceptInvite(id, token, c.var.user.id);

      return c.json({ success: true }, 202);
    }
  )
  .get('/:id', zValidator('param', readHouseholdPathParamsModel), async (c) => {
    const household = await HouseholdsService.read(c.req.valid('param').id);

    if (!household) {
      return c.body(null, 404);
    }

    return c.json(household);
  })
  .post('/', zValidator('json', createHouseholdModel), async (c) => {
    const userId = c.var.user.id;
    const existingHousehold = await HouseholdsService.readForUser(userId);

    if (existingHousehold) {
      return c.json(ErrorsService.createRootError('User already has a household'), 400);
    }

    const newHousehold = await HouseholdsService.create({ ...c.req.valid('json'), ownerId: userId });
    return c.json(newHousehold, 201);
  })
  .post(
    '/:id/invite',
    zValidator('param', readHouseholdPathParamsModel),
    zValidator('json', inviteHouseholdMembersModel),
    zValidator('query', inviteHouseholdMembersQueryParamsModel),
    async (c) => {
      const { id: householdId } = c.req.valid('param');
      const data = c.req.valid('json');
      const { callbackUrl } = c.req.valid('query');
      const { id: userId } = c.var.user;

      await HouseholdsService.invite(householdId, userId, data, callbackUrl, c);

      return c.json({ success: true }, 200);
    }
  )
  .delete('/:id', zValidator('param', readHouseholdPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const userId = c.var.user.id;

    await HouseholdsService.delete(id, userId);

    return c.json({ success: true }, 202);
  });

export default householdsApp;
