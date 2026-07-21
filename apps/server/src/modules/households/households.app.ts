import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { zValidator } from '@/lib/validation';
import { withHousehold, withHouseholdOwner } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { ErrorsService } from '../errors/errors.service';
import { HouseholdsService } from './households.service';
import {
  acceptHouseholdInvitePathParamsModel,
  acceptHouseholdInviteQueryParamsModel,
  createHouseholdMembersModel,
  createHouseholdModel,
  deleteHouseholdInvitePathParamsModel,
  deleteHouseholdMemberPathParamsModel,
  inviteExistingMemberModel,
  inviteExistingMemberPathParamsModel,
  inviteHouseholdMembersModel,
  inviteHouseholdMembersQueryParamsModel,
  patchHouseholdMemberModel,
  patchHouseholdMemberPathParamsModel,
  patchHouseholdModel,
  readHouseholdInviteQueryParamsModel,
} from './models';

/** Routes scoped to the caller's own household — `c.var.household` is guaranteed by `withHousehold`. */
const myHouseholdApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', async (c) => {
    const household = await HouseholdsService.readForUser(c.var.user.id);

    if (!household) {
      return c.body(null, 404);
    }

    const mappedHousehold = {
      ...household,
      members: household.members.map((member) => HouseholdsService.toMemberResponse(member, household.ownerId)),
    };

    return c.json(mappedHousehold, 200);
  })
  .patch('/', withHouseholdOwner, zValidator('json', patchHouseholdModel), async (c) => {
    const updatedHousehold = await HouseholdsService.patch(c.var.household.id, c.req.valid('json'));

    return c.json(updatedHousehold, 200);
  })
  .delete('/', withHouseholdOwner, async (c) => {
    await HouseholdsService.delete(c.var.household.id);

    return c.json({ success: true }, 202);
  })
  .patch(
    '/members/:id',
    zValidator('param', patchHouseholdMemberPathParamsModel),
    zValidator('json', patchHouseholdMemberModel),
    async (c) => {
      const { id: householdMemberId } = c.req.valid('param');
      const { household, user } = c.var;
      const member = await HouseholdsService.readHouseholdMember(household.id, householdMemberId);

      if (member.userId !== user.id && household.ownerId !== user.id) {
        throw new HTTPException(403, { message: 'Only household owners can edit members other than themselves.' });
      }

      const updatedMember = await HouseholdsService.patchHouseholdMember(household.id, member.id, c.req.valid('json'));

      return c.json(updatedMember, 200);
    }
  )
  .delete('/members/:id', zValidator('param', deleteHouseholdMemberPathParamsModel), async (c) => {
    const { id: householdMemberId } = c.req.valid('param');
    const { household, user } = c.var;
    const member = await HouseholdsService.readHouseholdMember(household.id, householdMemberId);

    if (member.userId !== user.id && household.ownerId !== user.id) {
      throw new HTTPException(403, { message: 'Only household owners can delete members other than themselves.' });
    }

    await HouseholdsService.deleteHouseholdMember(household.id, member.id);

    return c.json({ success: true }, 202);
  })
  .post('/members', zValidator('json', createHouseholdMembersModel), async (c) => {
    const members = await HouseholdsService.addHouseholdMembers(c.var.household.id, c.req.valid('json').members);

    return c.json(members, 201);
  })
  .post(
    '/members/:id/invite',
    zValidator('param', inviteExistingMemberPathParamsModel),
    zValidator('json', inviteExistingMemberModel),
    zValidator('query', inviteHouseholdMembersQueryParamsModel),
    async (c) => {
      const { id: memberId } = c.req.valid('param');
      const { email } = c.req.valid('json');
      const { callbackUrl } = c.req.valid('query');

      await HouseholdsService.inviteExistingMember(c.var.household, memberId, email, callbackUrl, c.req.raw.headers);

      return c.json({ success: true }, 200);
    }
  )
  .post(
    '/invite',
    zValidator('json', inviteHouseholdMembersModel),
    zValidator('query', inviteHouseholdMembersQueryParamsModel),
    async (c) => {
      const { callbackUrl } = c.req.valid('query');

      await HouseholdsService.invite(c.var.household, c.req.valid('json'), callbackUrl, c.req.raw.headers);

      return c.json({ success: true }, 200);
    }
  )
  .get('/invites/active', async (c) => {
    const invites = await HouseholdsService.listActiveInvitesForHousehold(c.var.household.id);

    return c.json(invites, 200);
  })
  .delete('/invites/:id', withHouseholdOwner, zValidator('param', deleteHouseholdInvitePathParamsModel), async (c) => {
    await HouseholdsService.deleteInvite(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

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
  .route('/my', myHouseholdApp)
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
