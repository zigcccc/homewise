import { relations } from 'drizzle-orm';
import { date, integer, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household, householdMember } from './household';
import { medicalInfo } from './medical-info';

export const petTypeEnum = pgEnum('petType', ['dog', 'cat', 'turtle', 'hamster', 'horse', 'parrot', 'other']);
export const petSexEnum = pgEnum('petSex', ['male', 'female']);

export const petProfile = pgTable(
  'pet_profile',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => householdMember.id, { onDelete: 'cascade' }),
    dateOfBirth: date('date_of_birth'),
    joinedFamilyOn: date('joined_family_on'),
    type: petTypeEnum(),
    breed: text('breed'),
    sex: petSexEnum(),
    profilePicture: text('profile_picture'),
  },
  (table) => [unique('pet_profile_member_unique').on(table.householdId, table.memberId)]
);

export const petProfileRelations = relations(petProfile, ({ one }) => ({
  /** The household member (role `pet`) this profile describes. Surfaced as `pet` in responses. */
  member: one(householdMember, { fields: [petProfile.memberId], references: [householdMember.id] }),
  household: one(household, { fields: [petProfile.householdId], references: [household.id] }),
  /** The pet's medical record — created alongside the profile, one per profile. */
  medicalInfo: one(medicalInfo),
}));
