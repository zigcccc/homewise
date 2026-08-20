import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns } from '#lib/models';

export const householdMemberRole = createSelectSchema(schema.householdMemberRoleEnum);
export type HouseholdMemberRole = z.infer<typeof householdMemberRole>;

/** What the household counts money in. Mirrored from the DB enum; the web reads `.options` for its picker. */
export const currency = createSelectSchema(schema.currencyEnum);
export type Currency = z.infer<typeof currency>;

const householdColumns = {
  name: (model: z.ZodString) =>
    model
      .trim()
      .min(3, { error: 'Household name must contain at least 3 characters' })
      .max(64, { error: 'Household name must contain at most 64 characters' }),
};

export const insertHouseholdModel = createInsertSchema(schema.household, householdColumns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHousehold = z.infer<typeof insertHouseholdModel>;

export const createHouseholdModel = insertHouseholdModel.omit({ ownerId: true });
export type CreateHousehold = z.infer<typeof createHouseholdModel>;

export const patchHouseholdModel = createUpdateSchema(schema.household, householdColumns).omit({
  createdAt: true,
  updatedAt: true,
  id: true,
});
export type PatchHousehold = z.infer<typeof patchHouseholdModel>;

/**
 * `name` and `nickname` are nullable — a member row created by an invite has neither until the
 * invitee fills them in — but a member added by hand is being described right now, so the API asks
 * for a name and takes `''` for the optional nickname. `role` is required by the column itself.
 */
const memberName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(64, { error: 'Name must contain at most 64 characters' });

const memberNickname = z.string().trim().max(64, { error: 'Nickname must contain at most 64 characters' }).optional();

/** A member is linked to a user by accepting an invite, never by naming an id in the payload. */
const serverOwnedMemberColumns = { ...dbOwnedColumns, userId: true } as const;

export const createHouseholdMemberModel = createInsertSchema(schema.householdMember)
  .omit(serverOwnedMemberColumns)
  .extend({ name: memberName, nickname: memberNickname });
export type CreateHouseholdMember = z.infer<typeof createHouseholdMemberModel>;

export const createHouseholdMembersModel = z.object({
  members: z.array(createHouseholdMemberModel).min(1),
});
export type CreateHouseholdMembers = z.infer<typeof createHouseholdMembersModel>;

/**
 * Deliberately without `role`: this endpoint is owner-*or-self*, so a role here would let anyone
 * promote themselves to `adult`. Changing a role is its own owner-only route.
 */
export const patchHouseholdMemberModel = createUpdateSchema(schema.householdMember)
  .omit({ ...serverOwnedMemberColumns, role: true })
  .extend({ name: memberName.optional(), nickname: memberNickname });
export type PatchHouseholdMember = z.infer<typeof patchHouseholdMemberModel>;

export const patchHouseholdMemberRoleModel = z.object({ role: householdMemberRole });
export type PatchHouseholdMemberRole = z.infer<typeof patchHouseholdMemberRoleModel>;

export const patchHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const deleteHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

/** A pet is never an account holder, so it is never something you can invite someone to be. */
export const invitableRole = householdMemberRole.exclude(['pet']);
export type InvitableRole = z.infer<typeof invitableRole>;

export const inviteHouseholdMembersModel = z.object({
  members: z.array(z.object({ email: z.email(), role: invitableRole })),
});
export type InviteHouseholdMembers = z.infer<typeof inviteHouseholdMembersModel>;

export const inviteExistingMemberModel = z.object({ email: z.email() });
export type InviteExistingMember = z.infer<typeof inviteExistingMemberModel>;

export const inviteExistingMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const inviteHouseholdMembersQueryParamsModel = z.object({
  callbackUrl: z.url(),
});

export const readHouseholdInvitePathParamsModel = z.object({
  id: z.coerce.number<number>(),
});

export const readHouseholdInviteQueryParamsModel = z.object({ token: z.string() });

export const acceptHouseholdInvitePathParamsModel = z.object({ id: z.coerce.number<number>() });

export const acceptHouseholdInviteQueryParamsModel = z.object({ token: z.string() });

export const deleteHouseholdInvitePathParamsModel = z.object({ id: z.coerce.number<number>() });
