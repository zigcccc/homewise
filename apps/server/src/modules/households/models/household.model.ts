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

export const patchHouseholdMemberModel = createUpdateSchema(schema.householdMember).omit({
  createdAt: true,
  householdId: true,
  id: true,
  updatedAt: true,
  userId: true,
});
export type PatchHouseholdMember = z.infer<typeof patchHouseholdMemberModel>;

export const patchHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const deleteHouseholdMemberPathParamsModel = z.object({ id: z.coerce.number<number>() });

export const inviteHouseholdMembersModel = z.object({
  members: z.array(z.object({ email: z.email(), role: householdMemberRole })),
});
export type InviteHouseholdMembers = z.infer<typeof inviteHouseholdMembersModel>;

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
