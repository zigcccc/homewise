import { relations, sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { contact } from './contact';
import { household } from './household';
import { user } from './user';

/**
 * A place the household keeps things — the garage, the cellar, the storage unit across town, a
 * grandparent's attic. Coarse on purpose: where within it a thing sits is the item's business, and a
 * self-referential tree of shelves-inside-boxes is a shape nobody maintains.
 *
 * The address is free text because that's how people write one; the coordinates are what the map
 * pin resolves to, and either half is optional — a garage needs neither. They move together, which
 * is what the check enforces: half a coordinate pair is a pin that can't be drawn.
 *
 * Names are deduplicated case-insensitively, like stores and ingredients: two "Garage" rows would
 * split one place's contents across two locations you'd have to search separately.
 */
export const storageLocation = pgTable(
  'storage_location',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    /** `mode: 'number'`, as drizzle returns numeric as a string otherwise. 6 decimals is ~0.1m. */
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 9, scale: 6, mode: 'number' }),
  },
  (table) => [
    uniqueIndex('storage_location_household_name_unique').on(table.householdId, sql`lower(${table.name})`),
    check('storage_location_coordinates_check', sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL)`),
  ]
);

/**
 * One thing in storage.
 *
 * `householdId` is carried here as well as on the location, and that's deliberate rather than
 * sloppy: the primary read is "every item in the household", not "every item in this location", so
 * the column is what keeps that query — and its search, its filters and its counts — a plain
 * household-scoped read instead of one whose every filter has to reach through a join. Moving an
 * item between locations never changes it. `child_dictionary` carries it for the same reason.
 *
 * **`borrowedOn IS NOT NULL` is the definition of "on loan"** — the check enforces that the rest of
 * the loan is empty whenever it is, and that a loan always names somebody, so there is exactly one
 * way to ask either question.
 *
 * The borrower is a `contact`, so a lent-out thing carries a phone number to chase it with. The name
 * is written alongside the link rather than derived from it: deleting a contact only nulls the FK,
 * and an item lent to nobody is worse than one lent to a name we can no longer ring. The live
 * contact's name still wins while the link stands, so a rename propagates.
 */
export const storageItem = pgTable(
  'storage_item',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    locationId: integer('location_id')
      .notNull()
      .references(() => storageLocation.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
    /** How many of it. 1 for the overwhelming majority, which is why it defaults rather than nulls. */
    quantity: integer('quantity').notNull().default(1),
    /** A full blob URL, never a client-relative path. Owned under the `storage-items/` prefix. */
    photoUrl: text('photo_url'),
    /** Who has it. Survives their deletion as NULL, leaving `borrowedByName` as the record. */
    borrowedByContactId: integer('borrowed_by_contact_id').references(() => contact.id, { onDelete: 'set null' }),
    /** The borrower's name as of the lend. Always set on a loan; the live contact's name wins. */
    borrowedByName: text('borrowed_by_name'),
    /** NULL means the item is here. Set means it's out. */
    borrowedOn: date('borrowed_on'),
    /** When it was promised back. NULL is an open-ended loan, which is most of them. */
    dueOn: date('due_on'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    // The two reads this table serves: everything in the household, and everything in one location.
    index('storage_item_household_idx').on(table.householdId),
    index('storage_item_location_idx').on(table.locationId),
    // Postgres doesn't index FK referencing columns; without this the SET NULL on a contact delete
    // sequentially scans every item ever stored.
    index('storage_item_contact_idx').on(table.borrowedByContactId),
    check(
      'storage_item_loan_check',
      sql`(${table.borrowedOn} IS NULL AND ${table.borrowedByContactId} IS NULL AND ${table.borrowedByName} IS NULL AND ${table.dueOn} IS NULL) OR (${table.borrowedOn} IS NOT NULL AND ${table.borrowedByName} IS NOT NULL)`
    ),
    check('storage_item_quantity_check', sql`${table.quantity} > 0`),
  ]
);

export const storageLocationRelations = relations(storageLocation, ({ many, one }) => ({
  household: one(household, { fields: [storageLocation.householdId], references: [household.id] }),
  items: many(storageItem),
}));

export const storageItemRelations = relations(storageItem, ({ one }) => ({
  /** Who currently has it. Survives their deletion as NULL. */
  borrower: one(contact, { fields: [storageItem.borrowedByContactId], references: [contact.id] }),
  /** Who added it. Survives their account deletion as NULL. */
  creator: one(user, { fields: [storageItem.createdBy], references: [user.id] }),
  household: one(household, { fields: [storageItem.householdId], references: [household.id] }),
  location: one(storageLocation, { fields: [storageItem.locationId], references: [storageLocation.id] }),
}));
