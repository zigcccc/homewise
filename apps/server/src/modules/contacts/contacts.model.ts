import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { clearableDate, dbOwnedColumns, optionalText, searchQueryParam, sortDirection } from '#lib/models';

/** Contact categories, straight off the DB enum. Reused by the web for labels and selects. */
export const contactType = createSelectSchema(schema.contactTypeEnum);
export type ContactType = z.infer<typeof contactType>;

/** Link categories, straight off the DB enum. Reused by the web for labels and selects. */
export const contactLinkType = createSelectSchema(schema.contactLinkTypeEnum);
export type ContactLinkType = z.infer<typeof contactLinkType>;

/** Relationship roles, straight off the DB enum. Reused by the web for labels and selects. */
export const contactRelationRole = createSelectSchema(schema.contactRelationRoleEnum);
export type ContactRelationRole = z.infer<typeof contactRelationRole>;

/**
 * Hand-written, because a relation is a command over a *pair* rather than a row of the table.
 *
 * Both roles are stated from the frame of whichever contact the route names, which is not what the
 * columns hold — when that contact is the far end of an existing row, the service writes `role` to
 * the stored `inverseRole` and back again. Deriving this from the table would mean overriding every
 * field to get nothing back.
 */
const relationRoles = {
  /** What the other contact is to this one: "John is Sarah's **husband**". */
  role: contactRelationRole,
  /** And this one to them. Defaults through `INVERSE_ROLE` when omitted. */
  inverseRole: contactRelationRole.optional(),
};

export const createContactRelationModel = z.object({
  relatedContactId: z.coerce.number<number>().int().positive({ error: 'Pick a contact' }),
  ...relationRoles,
});
export type CreateContactRelation = z.infer<typeof createContactRelationModel>;

/**
 * Relations named while the contact is being created, written in the same transaction as the row
 * they hang off — the same bargain `links` makes. There is deliberately no equivalent on the patch
 * model: a relation belongs to *two* contacts, so a replace-all from one side would silently drop
 * what the other side recorded. Editing one goes through the relation endpoints.
 */
const relations = z
  .array(createContactRelationModel)
  .max(50, { error: 'A contact can have at most 50 relations' })
  .optional();

/** Empty string clears the value; a valid email is required otherwise. */
const email = z.email({ error: 'Enter a valid email' }).or(z.literal(''));

/** Friendly URL: trims, prepends `https://` when no scheme is given, then validates. */
const url = z
  .string()
  .trim()
  .min(1, { error: 'Enter a URL' })
  .max(2048, { error: 'URL must contain at most 2048 characters' })
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(z.url({ error: 'Enter a valid URL' }));

/** A single external link on a contact (website, social profile, …). Written with its parent. */
export const contactLinkModel = createInsertSchema(schema.contactLink, {
  name: (model) =>
    model
      .trim()
      .min(1, { error: 'Link name must contain at least 1 character' })
      .max(64, { error: 'Link name must contain at most 64 characters' }),
  url: () => url,
}).omit({ contactId: true, createdAt: true, id: true, updatedAt: true });
export type ContactLink = z.infer<typeof contactLinkModel>;

/** Attached links, capped so a contact can't accumulate an unbounded list. */
const links = z.array(contactLinkModel).max(20, { error: 'A contact can have at most 20 links' }).optional();

const contactName = {
  name: (model: z.ZodString) =>
    model
      .trim()
      .min(1, { error: 'Name must contain at least 1 character' })
      .max(128, { error: 'Name must contain at most 128 characters' }),
};

/** Every one of these is a value a form clears with `''`, which is not the column's NULL. */
const contactPayloadFields = {
  address: optionalText(256, 'Address'),
  /**
   * Only offered for `family`/`friend` contacts, and only in the UI: switching a contact's type is
   * not a reason to throw away a birthday somebody typed. The field hides; the row keeps it.
   */
  dateOfBirth: clearableDate.optional(),
  description: optionalText(500, 'Description'),
  email: email.optional(),
  links,
  phone: optionalText(64, 'Phone number'),
};

export const createContactModel = createInsertSchema(schema.contact, contactName)
  .omit(dbOwnedColumns)
  .extend({ ...contactPayloadFields, relations });
export type CreateContact = z.infer<typeof createContactModel>;

export const patchContactModel = createUpdateSchema(schema.contact, contactName)
  .omit(dbOwnedColumns)
  .extend(contactPayloadFields);
export type PatchContact = z.infer<typeof patchContactModel>;

export const contactPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const contactRelationPathParamsModel = contactPathParamsModel.extend({
  relationId: z.coerce.number<number>().int().positive(),
});

/**
 * `birthday` orders by whose is next rather than by the stored date — a 1974 birthday is not "older"
 * news than a 2019 one, it's simply further down the year. The service does it as a `MM-DD` string
 * comparison, so there is no year in it to sort by.
 */
export const contactSortKey = z.enum(['name', 'birthday', 'createdAt']);
export type ContactSortKey = z.infer<typeof contactSortKey>;

export const listContactsQueryParamsModel = z.object({
  /** Matched against the name, email, phone and notes. */
  search: searchQueryParam,
  /** Omitted, this is the whole address book — which is what the page is for. */
  type: contactType.optional().catch(undefined),
  sortKey: contactSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});
export type ListContactsQueryParams = z.infer<typeof listContactsQueryParamsModel>;

/** The pair is fixed once created — re-pointing a relation is a delete and an add. */
export const patchContactRelationModel = z.object(relationRoles).partial();
export type PatchContactRelation = z.infer<typeof patchContactRelationModel>;
