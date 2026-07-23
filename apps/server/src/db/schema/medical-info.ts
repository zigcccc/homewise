import { relations, sql } from 'drizzle-orm';
import { check, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { childProfile } from './child-profile';
import { contact } from './contact';
import { household } from './household';
import { petProfile } from './pet-profile';

/**
 * Per-profile medical record: a single medical ID number plus a set of linked contacts. Belongs to
 * *either* a child or a pet profile (never both, never neither — enforced by the check constraint) and
 * cascades away with it. Created eagerly alongside every profile, so a profile always has exactly one.
 */
export const medicalInfo = pgTable(
  'medical_info',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    childProfileId: integer('child_profile_id').references(() => childProfile.id, { onDelete: 'cascade' }),
    petProfileId: integer('pet_profile_id').references(() => petProfile.id, { onDelete: 'cascade' }),
    medicalIdNumber: text('medical_id_number'),
  },
  (table) => [
    unique('medical_info_child_profile_unique').on(table.childProfileId),
    unique('medical_info_pet_profile_unique').on(table.petProfileId),
    // Exactly one owner: a child profile xor a pet profile.
    check('medical_info_single_owner', sql`(${table.childProfileId} IS NULL) <> (${table.petProfileId} IS NULL)`),
  ]
);

/** Join table: which contacts a medical info has attached (many-to-many). */
export const medicalInfoContact = pgTable(
  'medical_info_contact',
  {
    ...baseDbEntityFields,
    medicalInfoId: integer('medical_info_id')
      .notNull()
      .references(() => medicalInfo.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
  },
  (table) => [unique('medical_info_contact_unique').on(table.medicalInfoId, table.contactId)]
);

export const medicalInfoRelations = relations(medicalInfo, ({ many, one }) => ({
  childProfile: one(childProfile, { fields: [medicalInfo.childProfileId], references: [childProfile.id] }),
  petProfile: one(petProfile, { fields: [medicalInfo.petProfileId], references: [petProfile.id] }),
  household: one(household, { fields: [medicalInfo.householdId], references: [household.id] }),
  /** Attached contacts, via the join table. Surfaced flattened as `contacts` in responses. */
  links: many(medicalInfoContact),
}));

export const medicalInfoContactRelations = relations(medicalInfoContact, ({ one }) => ({
  medicalInfo: one(medicalInfo, {
    fields: [medicalInfoContact.medicalInfoId],
    references: [medicalInfo.id],
  }),
  contact: one(contact, { fields: [medicalInfoContact.contactId], references: [contact.id] }),
}));
