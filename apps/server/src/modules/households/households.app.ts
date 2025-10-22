import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { zValidator } from '@/lib/validation';
import { type AppContext } from '@/types/app.type';

import { ErrorsService } from '../errors/errors.service';

import { HouseholdsService } from './households.service';
import {
  acceptHouseholdInvitePathParamsModel,
  acceptHouseholdInviteQueryParamsModel,
  createHouseholdModel,
  deleteHouseholdInvitePathParamsModel,
  deleteHouseholdMemberPathParamsModel,
  inviteHouseholdMembersModel,
  inviteHouseholdMembersQueryParamsModel,
  patchHouseholdMemberModel,
  patchHouseholdMemberPathParamsModel,
  patchHouseholdModel,
  readHouseholdInviteQueryParamsModel,
} from './models';

const householdsApp = new Hono<AppContext>()
  .post('/', zValidator('json', createHouseholdModel), async (c) => {
    const userId = c.var.user.id;
    const existingHouseholdsCount = await HouseholdsService.countForUser(userId);

    if (existingHouseholdsCount > 0) {
      return c.json(ErrorsService.createRootError('User already has a household'), 400);
    }

    const newHousehold = await HouseholdsService.create({ ...c.req.valid('json'), ownerId: userId });
    return c.json(newHousehold, 201);
  })
  .get('/my', async (c) => {
    const household = await HouseholdsService.readForUser(c.var.user.id);
    if (!household) {
      return c.body(null, 404);
    }

    const mappedHousehold = {
      ...household,
      members: household.members.map((member) => ({
        ...member,
        isOwner: member.userId === household.ownerId,
        householdOwnerId: household.ownerId,
      })),
    };

    return c.json(mappedHousehold, 200);
  })
  .patch('/my', zValidator('json', patchHouseholdModel), async (c) => {
    const data = c.req.valid('json');
    const updatedHousehold = await HouseholdsService.patch(data, c.var.user.id);

    return c.json(updatedHousehold, 200);
  })
  .delete('/my', async (c) => {
    const userId = c.var.user.id;
    const household = await HouseholdsService.readForOwner(userId);

    if (!household) {
      throw new HTTPException(404, { message: 'Household not found' });
    }

    await HouseholdsService.delete(household.id, userId);

    return c.json({ success: true }, 202);
  })
  .patch(
    '/my/members/:id',
    zValidator('param', patchHouseholdMemberPathParamsModel),
    zValidator('json', patchHouseholdMemberModel),
    async (c) => {
      const { id: householdMemberId } = c.req.valid('param');
      const household = await HouseholdsService.readForUser(c.var.user.id);

      if (!household) {
        throw new HTTPException(404, { message: 'Household not found' });
      }

      const member = await HouseholdsService.readHouseholdMember(household.id, householdMemberId);

      if (member.userId !== c.var.user.id && household.ownerId !== c.var.user.id) {
        throw new HTTPException(403, { message: 'Only household owners can edit members other than themselves.' });
      }

      const updatedMember = await HouseholdsService.patchHouseholdMember(household.id, member.id, c.req.valid('json'));

      return c.json(updatedMember, 200);
    }
  )
  .delete('/my/members/:id', zValidator('param', deleteHouseholdMemberPathParamsModel), async (c) => {
    const { id: householdMemberId } = c.req.valid('param');
    const household = await HouseholdsService.readForUser(c.var.user.id);

    if (!household) {
      throw new HTTPException(404, { message: 'Household not found' });
    }

    const member = await HouseholdsService.readHouseholdMember(household.id, householdMemberId);

    if (member.userId !== c.var.user.id && household.ownerId !== c.var.user.id) {
      throw new HTTPException(403, { message: 'Only household owners can delete members other than themselves.' });
    }

    await HouseholdsService.deleteHouseholdMember(household.id, member.id);

    return c.json({ success: true }, 202);
  })
  .post(
    '/my/invite',
    zValidator('json', inviteHouseholdMembersModel),
    zValidator('query', inviteHouseholdMembersQueryParamsModel),
    async (c) => {
      const data = c.req.valid('json');
      const { callbackUrl } = c.req.valid('query');
      const { id: userId } = c.var.user;

      await HouseholdsService.invite(userId, data, callbackUrl, c);

      return c.json({ success: true }, 200);
    }
  )
  .get('/my/invites/active', async (c) => {
    const household = await HouseholdsService.readForUser(c.var.user.id);
    if (!household) {
      throw new HTTPException(404, { message: 'Household not found.' });
    }
    const invites = await HouseholdsService.listActiveInvitesForHousehold(household.id);

    return c.json(invites, 200);
  })
  .delete('/my/invites/:id', zValidator('param', deleteHouseholdInvitePathParamsModel), async (c) => {
    const household = await HouseholdsService.readForUser(c.var.user.id);

    if (!household) {
      throw new HTTPException(404, { message: 'Household not found.' });
    }

    if (household.ownerId !== c.var.user.id) {
      throw new HTTPException(403, { message: 'Only owners can revoke invites.' });
    }

    await HouseholdsService.deleteInvite(household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
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
  );

export default householdsApp;
