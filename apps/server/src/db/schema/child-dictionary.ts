import { relations } from 'drizzle-orm';
import { boolean, date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { childProfile } from './child-profile';
import { household } from './household';
import { user } from './user';

export const childDictionary = pgTable(
  'child_dictionary',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => childProfile.id, { onDelete: 'cascade' }),
  },
  (table) => [unique('child_dictionary_profile_unique').on(table.profileId)]
);

export const childDictionaryEntry = pgTable('child_dictionary_entry', {
  ...baseDbEntityFields,
  dictionaryId: integer('dictionary_id')
    .notNull()
    .references(() => childDictionary.id, { onDelete: 'cascade' }),
  childPhrase: text('child_phrase').notNull(),
  adultTranslation: text('adult_translation').notNull(),
  notes: text('notes'),
  firstHeardOn: date('first_heard_on'),
  archived: boolean('archived').notNull().default(false),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
});

export const childDictionaryRelations = relations(childDictionary, ({ many, one }) => ({
  /** The child profile this dictionary belongs to. */
  profile: one(childProfile, { fields: [childDictionary.profileId], references: [childProfile.id] }),
  entries: many(childDictionaryEntry),
  household: one(household, { fields: [childDictionary.householdId], references: [household.id] }),
}));

export const childDictionaryEntryRelations = relations(childDictionaryEntry, ({ one }) => ({
  creator: one(user, { fields: [childDictionaryEntry.createdBy], references: [user.id] }),
  dictionary: one(childDictionary, {
    fields: [childDictionaryEntry.dictionaryId],
    references: [childDictionary.id],
  }),
}));
