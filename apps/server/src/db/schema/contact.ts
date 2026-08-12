import { relations, sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { medicalInfoContact } from './medical-info';

/** Link categories: a personal website (`web`), a social profile (`social`), or anything else. */
export const contactLinkTypeEnum = pgEnum('contactLinkType', ['web', 'social', 'other']);

/**
 * Contact categories. Kept broad and app-wide: a contact is a standalone household record, so a
 * `medical` contact (a doctor, or a vet on a pet profile) sits next to `business`/`family`/`other`.
 * Relationship roles (teacher, sitter, …) are deferred to future link tables, not this enum.
 *
 * `friend` reads as if it belongs beside `family`, and deliberately doesn't sit there: drizzle-kit
 * emits a plain additive `ALTER TYPE … ADD VALUE` only for a value appended at the **end**, and can
 * drop and recreate the type for one spliced into the middle. Order here carries no meaning — the
 * list endpoint filters by type and never sorts by it.
 */
export const contactTypeEnum = pgEnum('contactType', ['medical', 'business', 'family', 'other', 'friend']);

/**
 * How one contact stands to another. Gendered and neutral wordings both, because a household says
 * "John is Sarah's husband" rather than "spouse" — and a contact carries no sex to derive it from.
 * Every value has a default opposite in `INVERSE_ROLE`, which is only a starting suggestion: the
 * stored inverse is the caller's to set.
 */
export const contactRelationRoleEnum = pgEnum('contactRelationRole', [
  'spouse',
  'husband',
  'wife',
  'partner',
  'parent',
  'mother',
  'father',
  'child',
  'son',
  'daughter',
  'sibling',
  'brother',
  'sister',
  'grandparent',
  'grandchild',
  'aunt_uncle',
  'niece_nephew',
  'cousin',
  'friend',
  'neighbour',
  'colleague',
  'other',
]);

/**
 * A standalone, reusable household contact — an address-book entry, not owned by any one feature.
 * Medical info attaches contacts through a join table; future features (a kid's teachers, sitters,
 * a pet's trainer) reuse the same rows.
 */
export const contact = pgTable('contact', {
  ...baseDbEntityFields,
  householdId: integer('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  type: contactTypeEnum().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  /** Named as the profiles name theirs, so "how old is this person" is one helper across all three. */
  dateOfBirth: date('date_of_birth'),
});

/** External links attached to a contact (website, social profiles, …). Owned by the contact; cascades. */
export const contactLink = pgTable('contact_link', {
  ...baseDbEntityFields,
  contactId: integer('contact_id')
    .notNull()
    .references(() => contact.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: contactLinkTypeEnum().notNull(),
});

/**
 * How two contacts stand to one another, stored once and read from both ends: the row says
 * "`relatedContact` is `contact`'s `role`", and turned around, "`contact` is `relatedContact`'s
 * `inverseRole`".
 *
 * Both wordings live on the **one** row on purpose. Two mirrored rows would let the halves of a
 * single fact disagree — rename one side and the other still claims the old thing — and would make
 * every add, edit and delete two pieces of work with no way to notice when only one landed.
 */
export const contactRelation = pgTable(
  'contact_relation',
  {
    ...baseDbEntityFields,
    contactId: integer('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    relatedContactId: integer('related_contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    role: contactRelationRoleEnum().notNull(),
    inverseRole: contactRelationRoleEnum().notNull(),
  },
  (table) => [
    // One row per pair whichever end entered it — (John, Sarah) and (Sarah, John) are the same fact.
    // Only an expression index can say that; a unique() on the two columns takes both rows happily.
    uniqueIndex('contact_relation_pair_unique').on(
      sql`least(${table.contactId}, ${table.relatedContactId})`,
      sql`greatest(${table.contactId}, ${table.relatedContactId})`
    ),
    check('contact_relation_self_check', sql`${table.contactId} <> ${table.relatedContactId}`),
    // The pair index is keyed on least/greatest, so it can't serve a lookup by this column alone.
    index('contact_relation_related_idx').on(table.relatedContactId),
  ]
);

export const contactRelations = relations(contact, ({ many, one }) => ({
  household: one(household, { fields: [contact.householdId], references: [household.id] }),
  /** Every medical-info link that references this contact. */
  medicalLinks: many(medicalInfoContact),
  /** The contact's external links (website, socials, …). */
  links: many(contactLink),
  /** Relations entered from this end — each row's `role` is what the *other* contact is to this one. */
  relationsAsContact: many(contactRelation, { relationName: 'contactRelationSubject' }),
  /** Relations entered from the far end — there it's `inverseRole` that describes the other contact. */
  relationsAsRelated: many(contactRelation, { relationName: 'contactRelationObject' }),
}));

// Both legs point at `contact`, so each needs a `relationName` — without one drizzle cannot tell
// which `many()` above a given `one()` belongs to.
export const contactRelationRelations = relations(contactRelation, ({ one }) => ({
  contact: one(contact, {
    fields: [contactRelation.contactId],
    references: [contact.id],
    relationName: 'contactRelationSubject',
  }),
  relatedContact: one(contact, {
    fields: [contactRelation.relatedContactId],
    references: [contact.id],
    relationName: 'contactRelationObject',
  }),
}));

export const contactLinkRelations = relations(contactLink, ({ one }) => ({
  contact: one(contact, { fields: [contactLink.contactId], references: [contact.id] }),
}));
