import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '@/db/schema';

export const householdMemberRole = createSelectSchema(schema.householdMemberRoleEnum);
export type HouseholdMemberRole = z.infer<typeof householdMemberRole>;

export const insertHouseholdModel = createInsertSchema(schema.household, {
  name: (model) =>
    model
      .trim()
      .min(3, { error: 'Household name must contain at least 3 characters' })
      .max(64, { error: 'Household name must contain at most 64 characters' }),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHousehold = z.infer<typeof insertHouseholdModel>;

export const createHouseholdModel = insertHouseholdModel.omit({ ownerId: true });
export type CreateHousehold = z.infer<typeof createHouseholdModel>;

export const patchHouseholdModel = createUpdateSchema(schema.household, {
  name: (model) =>
    model
      .trim()
      .min(3, { error: 'Household name must contain at least 3 characters' })
      .max(64, { error: 'Household name must contain at most 64 characters' }),
}).omit({ createdAt: true, updatedAt: true, id: true });
export type PatchHousehold = z.infer<typeof patchHouseholdModel>;

const memberName = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(64, { error: 'Name must contain at most 64 characters' });

const memberNickname = (model: z.ZodString) =>
  model.trim().max(64, { error: 'Nickname must contain at most 64 characters' });

export const createHouseholdMemberModel = z.object({
  name: memberName(z.string()),
  nickname: memberNickname(z.string()).optional(),
  role: householdMemberRole,
});
export type CreateHouseholdMember = z.infer<typeof createHouseholdMemberModel>;

export const createHouseholdMembersModel = z.object({
  members: z.array(createHouseholdMemberModel).min(1),
});
export type CreateHouseholdMembers = z.infer<typeof createHouseholdMembersModel>;

export const patchHouseholdMemberModel = createUpdateSchema(schema.householdMember)
  .omit({
    createdAt: true,
    householdId: true,
    id: true,
    name: true,
    nickname: true,
    updatedAt: true,
    userId: true,
  })
  .extend({
    name: memberName(z.string()).optional(),
    nickname: memberNickname(z.string()).optional(),
  });
export type PatchHouseholdMember = z.infer<typeof patchHouseholdMemberModel>;

export const patchHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const deleteHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const inviteHouseholdMembersModel = z.object({
  members: z.array(z.object({ email: z.email(), role: householdMemberRole })),
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
