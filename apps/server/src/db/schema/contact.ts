import { relations } from 'drizzle-orm';
import { integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { medicalInfoContact } from './medical-info';

/** Link categories: a personal website (`web`), a social profile (`social`), or anything else. */
export const contactLinkTypeEnum = pgEnum('contactLinkType', ['web', 'social', 'other']);

/**
 * Contact categories. Kept broad and app-wide: a contact is a standalone household record, so a
 * `medical` contact (a doctor, or a vet on a pet profile) sits next to `business`/`family`/`other`.
 * Relationship roles (teacher, sitter, …) are deferred to future link tables, not this enum.
 */
export const contactTypeEnum = pgEnum('contactType', ['medical', 'business', 'family', 'other']);

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

export const contactRelations = relations(contact, ({ many, one }) => ({
  household: one(household, { fields: [contact.householdId], references: [household.id] }),
  /** Every medical-info link that references this contact. */
  medicalLinks: many(medicalInfoContact),
  /** The contact's external links (website, socials, …). */
  links: many(contactLink),
}));

export const contactLinkRelations = relations(contactLink, ({ one }) => ({
  contact: one(contact, { fields: [contactLink.contactId], references: [contact.id] }),
}));
