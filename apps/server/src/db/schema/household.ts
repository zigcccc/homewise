import { relations } from 'drizzle-orm';
import { boolean, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { currencyEnum } from './__shared/currency';
import { childProfile } from './child-profile';
import { expense, expenseCategory } from './expense';
import { plannedDayNote, plannedMeal, plannedMealMember } from './meal-plan';
import { petProfile } from './pet-profile';
import { ingredient, recipe, recipeTag } from './recipe';
import { shoppingList } from './shopping-list';
import { storageItem, storageLocation } from './storage';
import { store } from './store';
import { user } from './user';

export const householdMemberRoleEnum = pgEnum('householdMemberRole', ['adult', 'child', 'pet', 'external']);

export const household = pgTable('household', {
  ...baseDbEntityFields,
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /**
   * What this household's money is counted in. Every expense copies it at write time, so changing it
   * here decides what *future* rows are logged in and leaves past months reading as they were.
   */
  currency: currencyEnum().notNull().default('EUR'),
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
  /** Meals this person is specifically assigned to eat. */
  plannedMeals: many(plannedMealMember),
  user: one(user, { fields: [householdMember.userId], references: [user.id] }),
}));

export const householdRelations = relations(household, ({ many, one }) => ({
  childProfiles: many(childProfile),
  petProfiles: many(petProfile),
  expenseCategories: many(expenseCategory),
  expenses: many(expense),
  ingredients: many(ingredient),
  invites: many(householdInvite),
  members: many(householdMember),
  owner: one(user, { fields: [household.ownerId], references: [user.id] }),
  plannedDayNotes: many(plannedDayNote),
  plannedMeals: many(plannedMeal),
  recipeTags: many(recipeTag),
  recipes: many(recipe),
  shoppingLists: many(shoppingList),
  storageItems: many(storageItem),
  storageLocations: many(storageLocation),
  stores: many(store),
}));

export const householdInviteRelations = relations(householdInvite, ({ one }) => ({
  household: one(household, { fields: [householdInvite.householdId], references: [household.id] }),
  member: one(householdMember, { fields: [householdInvite.memberId], references: [householdMember.id] }),
}));
