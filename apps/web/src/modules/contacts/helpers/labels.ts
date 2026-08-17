import { type ContactLinkType, type ContactRelationRole, type ContactType } from '@homewise/server/contacts';

/** Human-readable labels for the contact `type` enum. */
export const contactTypeLabels: Record<ContactType, string> = {
  medical: 'Medical',
  business: 'Business',
  family: 'Family',
  friend: 'Friend',
  other: 'Other',
};

/** The contact types that keep a birthday and relations — see `showsPersonalDetails`. */
export const PERSONAL_CONTACT_TYPES: ContactType[] = ['family', 'friend'];

const personalContactTypes = new Set<ContactType>(PERSONAL_CONTACT_TYPES);

/**
 * Whether to offer a contact's birthday and relations.
 *
 * A dentist has neither, so the fields stay out of the way for the types that never use them. The
 * second clause is what keeps that from destroying anything: retyping a friend as a business contact
 * hides the fields, and a birthday already recorded goes on showing rather than becoming a value
 * nobody can see or clear.
 */
export const showsPersonalDetails = (type: ContactType, hasPersonalDetails = false) =>
  personalContactTypes.has(type) || hasPersonalDetails;

/** Human-readable labels for the relationship-role enum. */
export const contactRelationRoleLabels: Record<ContactRelationRole, string> = {
  spouse: 'Spouse',
  husband: 'Husband',
  wife: 'Wife',
  partner: 'Partner',
  parent: 'Parent',
  mother: 'Mother',
  father: 'Father',
  child: 'Child',
  son: 'Son',
  daughter: 'Daughter',
  sibling: 'Sibling',
  brother: 'Brother',
  sister: 'Sister',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  aunt_uncle: 'Aunt / uncle',
  niece_nephew: 'Niece / nephew',
  cousin: 'Cousin',
  friend: 'Friend',
  neighbour: 'Neighbour',
  colleague: 'Colleague',
  other: 'Other',
};

/** Human-readable labels for the contact-link `type` enum. */
export const contactLinkTypeLabels: Record<ContactLinkType, string> = {
  web: 'Web',
  social: 'Social',
  other: 'Other',
};

/** Pet profiles surface a `medical` contact as the animal's vet. */
export const petContactTypeLabels: Record<ContactType, string> = {
  ...contactTypeLabels,
  medical: 'Veterinary',
};
