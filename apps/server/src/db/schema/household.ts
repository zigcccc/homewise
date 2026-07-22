import { relations } from 'drizzle-orm';
import { boolean, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { childProfile } from './child-profile';
import { petProfile } from './pet-profile';
import { user } from './user';

export const householdMemberRoleEnum = pgEnum('householdMemberRole', ['adult', 'child', 'pet', 'external']);

export const household = pgTable('household', {
  ...baseDbEntityFields,
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const householdMember = pgTable('household_member', {
  ...baseDbEntityFields,
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  name: text('name'),
  nickname: text('nickname'),
  role: householdMemberRoleEnum(),
});

export const householdInvite = pgTable('household_invite', {
  ...baseDbEntityFields,
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').references(() => householdMember.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  email: text('email').notNull(),
  role: householdMemberRoleEnum(),
  claimed: boolean('claimed').default(false),
});

export const householdMemberRelations = relations(householdMember, ({ many, one }) => ({
  childProfiles: many(childProfile),
  petProfiles: many(petProfile),
  household: one(household, { fields: [householdMember.householdId], references: [household.id] }),
  user: one(user, { fields: [householdMember.userId], references: [user.id] }),
}));

export const householdRelations = relations(household, ({ many, one }) => ({
  childProfiles: many(childProfile),
  petProfiles: many(petProfile),
  invites: many(householdInvite),
  members: many(householdMember),
  owner: one(user, { fields: [household.ownerId], references: [user.id] }),
}));

export const householdInviteRelations = relations(householdInvite, ({ one }) => ({
  household: one(household, { fields: [householdInvite.householdId], references: [household.id] }),
  member: one(householdMember, { fields: [householdInvite.memberId], references: [householdMember.id] }),
}));
