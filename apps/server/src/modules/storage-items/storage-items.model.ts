import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import {
  clearableDate,
  dbOwnedColumns,
  optionalText,
  profileImage,
  searchQueryParam,
  sortDirection,
} from '#lib/models';
import { createContactModel } from '#modules/contacts/contacts.model';

/**
 * The blob namespace item photos are uploaded into. `cleanupOwnedImage` guards on the top-level
 * segment alone, so whatever a service puts below it is organisation rather than security.
 */
export const storageItemImagePrefix = 'storage-items';

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const storageItemName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

/** An item is written as multipart because of the photo, and multipart sends numbers as strings. */
const locationId = z.coerce.number<number>().int().positive({ error: 'Pick a storage location' });
const quantity = z.coerce
  .number<number>()
  .int({ error: 'Quantity must be a whole number' })
  .min(1, { error: 'Quantity must be at least 1' })
  .max(100_000, { error: 'Quantity must be at most 100000' });

/**
 * The loan columns are driven by the lend/return endpoints, `photoUrl` by the upload, and `createdBy`
 * by the session — none of them are the caller's to set.
 */
const serverOwnedItemColumns = {
  ...dbOwnedColumns,
  borrowedByContactId: true,
  borrowedByName: true,
  borrowedOn: true,
  createdBy: true,
  dueOn: true,
  photoUrl: true,
} as const;

/** `image` is a `File` to upload or `''` to clear; anything else means "leave the photo alone". */
const itemPayloadFields = {
  image: profileImage,
  notes: optionalText(1000, 'Notes'),
};

export const createStorageItemModel = createInsertSchema(schema.storageItem, { name: () => storageItemName })
  .omit(serverOwnedItemColumns)
  .extend({ ...itemPayloadFields, locationId, quantity: quantity.optional() });
export type CreateStorageItem = z.infer<typeof createStorageItemModel>;

export const patchStorageItemModel = createUpdateSchema(schema.storageItem, { name: () => storageItemName })
  .omit(serverOwnedItemColumns)
  // Passing `locationId` is what moves an item; there is no separate move endpoint.
  .extend({ ...itemPayloadFields, locationId: locationId.optional(), quantity: quantity.optional() });
export type PatchStorageItem = z.infer<typeof patchStorageItemModel>;

/**
 * Lending is a command over the row rather than the row itself: one body drives four columns and may
 * mint a contact, so deriving it would mean overriding every field to get nothing back.
 *
 * The borrower is either an existing contact or a new one created with the loan — the same
 * create-or-link shape medical info uses — because "who has it" is only useful with a phone number
 * attached, and making people visit an address book first is how a loan goes unrecorded.
 */
const loanDates = {
  /** Defaults to today in the service — the overwhelmingly common answer. */
  borrowedOn: z.iso.date({ error: 'Use a valid date' }).optional(),
  dueOn: clearableDate.optional(),
};

export const lendStorageItemModel = z.union([
  z.object({ contactId: z.number().int().positive(), ...loanDates }),
  z.object({ contact: createContactModel, ...loanDates }),
]);
export type LendStorageItem = z.infer<typeof lendStorageItemModel>;

export const storageItemPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const storageItemSortKey = z.enum(['name', 'createdAt', 'dueOn']);
export type StorageItemSortKey = z.infer<typeof storageItemSortKey>;

/** `overdue` is the subset of `onLoan` whose due date has passed — the one worth chasing. */
export const storageItemLoanStatus = z.enum(['all', 'available', 'onLoan', 'overdue']);
export type StorageItemLoanStatus = z.infer<typeof storageItemLoanStatus>;

export const listStorageItemsQueryParamsModel = z.object({
  /** Matched against the name and the notes both. */
  search: searchQueryParam,
  /** Omitted, this is every item in the household — which is the point of the items view. */
  locationId: z.coerce.number<number>().int().positive().optional().catch(undefined),
  loanStatus: storageItemLoanStatus.default('all').catch('all'),
  sortKey: storageItemSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});
export type ListStorageItemsQueryParams = z.infer<typeof listStorageItemsQueryParamsModel>;
