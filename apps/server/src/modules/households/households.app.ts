import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { zValidator } from '#lib/validation';
import { withHousehold, withHouseholdOwner } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { ActivityService } from '../activity/activity.service';
import { ErrorsService } from '../errors/errors.service';
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
} from './households.model';
import { HouseholdsService } from './households.service';

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
    const { data: updatedHousehold, changeset } = await HouseholdsService.patch(
      c.var.household.id,
      c.req.valid('json')
    );

    c.var.emit({
      entity: 'household',
      id: updatedHousehold.id,
      operation: 'update',
      label: updatedHousehold.name,
      changes: changeset,
    });

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

      const { data: updatedMember, changeset } = await HouseholdsService.patchHouseholdMember(
        household.id,
        member.id,
        c.req.valid('json')
      );

      c.var.emit({
        entity: 'household_member',
        id: updatedMember.id,
        operation: 'update',
        label: HouseholdsService.memberDisplayName(updatedMember),
        changes: changeset,
      });

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

    const deleted = await HouseholdsService.deleteHouseholdMember(household.id, member.id);

    c.var.emit({
      entity: 'household_member',
      id: member.id,
      operation: 'delete',
      label: HouseholdsService.memberDisplayName(deleted),
    });

    return c.json({ success: true }, 202);
  })
  .post('/members', zValidator('json', createHouseholdMembersModel), async (c) => {
    const members = await HouseholdsService.addHouseholdMembers(c.var.household.id, c.req.valid('json').members);

    // One line each: adding three people is three things that happened, not one.
    c.var.emit(
      ...members.map((member) => ({
        entity: 'household_member' as const,
        id: member.id,
        operation: 'create' as const,
        label: HouseholdsService.memberDisplayName(member),
      }))
    );

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

      // The invite has no id worth sending — the client refetches the active list either way.
      c.var.emit({ entity: 'household_invite', id: null, operation: 'create', label: email });

      return c.json({ success: true }, 200);
    }
  )
  .post(
    '/invite',
    zValidator('json', inviteHouseholdMembersModel),
    zValidator('query', inviteHouseholdMembersQueryParamsModel),
    async (c) => {
      const { callbackUrl } = c.req.valid('query');
      const payload = c.req.valid('json');

      await HouseholdsService.invite(c.var.household, payload, callbackUrl, c.req.raw.headers);

      c.var.emit(
        ...payload.members.map((member) => ({
          entity: 'household_invite' as const,
          id: null,
          operation: 'create' as const,
          label: member.email,
        }))
      );

      return c.json({ success: true }, 200);
    }
  )
  .get('/invites/active', async (c) => {
    const invites = await HouseholdsService.listActiveInvitesForHousehold(c.var.household.id);

    return c.json(invites, 200);
  })
  .delete('/invites/:id', withHouseholdOwner, zValidator('param', deleteHouseholdInvitePathParamsModel), async (c) => {
    const deleted = await HouseholdsService.deleteInvite(c.var.household.id, c.req.valid('param').id);

    c.var.emit({ entity: 'household_invite', id: deleted.id, operation: 'delete', label: deleted.email });

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

    // Outside `withHousehold`: there was no household to resolve, and nobody else is here to announce to.
    await ActivityService.record(newHousehold.id, c.var.user, [
      { entity: 'household', id: newHousehold.id, operation: 'create', label: newHousehold.name },
    ]);

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

      const { data: member, joined } = await HouseholdsService.acceptInvite(id, token, c.var.user.id);

      // Also outside `withHousehold`: the accepting user had no household until this call returned.
      // Only a first accept is a joining — a second one just retires a duplicate invite.
      if (joined) {
        await ActivityService.record(member.householdId, c.var.user, [
          { entity: 'household_member', id: member.id, operation: 'create', label: c.var.user.name },
        ]);
      }

      return c.json({ success: true }, 202);
    }
  );

export default householdsApp;
