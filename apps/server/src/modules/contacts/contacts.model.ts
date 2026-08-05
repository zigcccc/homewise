import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, optionalText } from '#lib/models';

/** Contact categories, straight off the DB enum. Reused by the web for labels and selects. */
export const contactType = createSelectSchema(schema.contactTypeEnum);
export type ContactType = z.infer<typeof contactType>;

/** Link categories, straight off the DB enum. Reused by the web for labels and selects. */
export const contactLinkType = createSelectSchema(schema.contactLinkTypeEnum);
export type ContactLinkType = z.infer<typeof contactLinkType>;

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

/** Every one of these is text a form clears with `''`, which is not the column's NULL. */
const contactPayloadFields = {
  address: optionalText(256, 'Address'),
  description: optionalText(500, 'Description'),
  email: email.optional(),
  links,
  phone: optionalText(64, 'Phone number'),
};

export const createContactModel = createInsertSchema(schema.contact, contactName)
  .omit(dbOwnedColumns)
  .extend(contactPayloadFields);
export type CreateContact = z.infer<typeof createContactModel>;

export const patchContactModel = createUpdateSchema(schema.contact, contactName)
  .omit(dbOwnedColumns)
  .extend(contactPayloadFields);
export type PatchContact = z.infer<typeof patchContactModel>;

export const contactPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
