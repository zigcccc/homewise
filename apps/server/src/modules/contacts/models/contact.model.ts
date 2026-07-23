import z from 'zod';

/** Contact categories, mirrored from the DB enum. Reused by the web for labels and selects. */
export const contactType = z.enum(['medical', 'business', 'family', 'other']);
export type ContactType = z.infer<typeof contactType>;

const name = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(128, { error: 'Name must contain at most 128 characters' });

/** Free-text optional field: trims, caps length, and treats an empty string as "cleared". */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must contain at most ${max} characters` })
    .or(z.literal(''))
    .optional();

/** Empty string clears the value; a valid email is required otherwise. */
const email = z.email({ error: 'Enter a valid email' }).or(z.literal('')).optional();

/** Link categories, mirrored from the DB enum. Reused by the web for labels and selects. */
export const contactLinkType = z.enum(['web', 'social', 'other']);
export type ContactLinkType = z.infer<typeof contactLinkType>;

/** Friendly URL: trims, prepends `https://` when no scheme is given, then validates. */
const url = z
  .string()
  .trim()
  .min(1, { error: 'Enter a URL' })
  .max(2048, { error: 'URL must contain at most 2048 characters' })
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(z.url({ error: 'Enter a valid URL' }));

/** A single external link on a contact (website, social profile, …). */
export const contactLinkModel = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Link name must contain at least 1 character' })
    .max(64, { error: 'Link name must contain at most 64 characters' }),
  url,
  type: contactLinkType,
});
export type ContactLink = z.infer<typeof contactLinkModel>;

/** Attached links, capped so a contact can't accumulate an unbounded list. */
const links = z.array(contactLinkModel).max(20, { error: 'A contact can have at most 20 links' }).optional();

export const createContactModel = z.object({
  type: contactType,
  name: name(z.string()),
  description: optionalText(500, 'Description'),
  email,
  phone: optionalText(64, 'Phone number'),
  address: optionalText(256, 'Address'),
  links,
});
export type CreateContact = z.infer<typeof createContactModel>;

export const patchContactModel = z.object({
  type: contactType.optional(),
  name: name(z.string()).optional(),
  description: optionalText(500, 'Description'),
  email,
  phone: optionalText(64, 'Phone number'),
  address: optionalText(256, 'Address'),
  links,
});
export type PatchContact = z.infer<typeof patchContactModel>;

export const contactPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
