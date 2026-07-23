import { type ContactLinkType, type ContactType } from '@homewise/server/contacts';

/** Human-readable labels for the contact `type` enum. */
export const contactTypeLabels: Record<ContactType, string> = {
  medical: 'Medical',
  business: 'Business',
  family: 'Family',
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
