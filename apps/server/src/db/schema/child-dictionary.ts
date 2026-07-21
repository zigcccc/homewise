import { relations } from 'drizzle-orm';
import { boolean, date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household, householdMember } from './household';
import { user } from './user';

export const childDictionary = pgTable(
  'child_dictionary',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => householdMember.id, { onDelete: 'cascade' }),
  },
  (table) => [unique('child_dictionary_member_unique').on(table.householdId, table.memberId)]
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
  /** The household member (role `child`) this dictionary belongs to. */
  child: one(householdMember, { fields: [childDictionary.memberId], references: [householdMember.id] }),
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
