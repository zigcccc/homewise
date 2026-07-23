import { relations } from 'drizzle-orm';
import { date, integer, pgEnum, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { childDictionary } from './child-dictionary';
import { household, householdMember } from './household';
import { medicalInfo } from './medical-info';

export const childSexEnum = pgEnum('childSex', ['male', 'female']);

export const childProfile = pgTable(
  'child_profile',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => householdMember.id, { onDelete: 'cascade' }),
    dateOfBirth: date('date_of_birth'),
    sex: childSexEnum(),
    nationalId: text('national_id'),
    taxId: text('tax_id'),
    profilePicture: text('profile_picture'),
  },
  (table) => [unique('child_profile_member_unique').on(table.householdId, table.memberId)]
);

export const childProfileRelations = relations(childProfile, ({ one }) => ({
  /** The household member (role `child`) this profile describes. Surfaced as `child` in responses. */
  member: one(householdMember, { fields: [childProfile.memberId], references: [householdMember.id] }),
  household: one(household, { fields: [childProfile.householdId], references: [household.id] }),
  /** The child's dictionary — the first sub-feature hanging off the profile. */
  dictionary: one(childDictionary),
  /** The child's medical record — created alongside the profile, one per profile. */
  medicalInfo: one(medicalInfo),
}));
