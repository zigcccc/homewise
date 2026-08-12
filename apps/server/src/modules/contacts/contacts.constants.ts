import { type ContactRelationRole } from './contacts.model';

/**
 * The opposite of each relationship role — what the *other* contact becomes when you say "John is
 * Sarah's husband".
 *
 * A **suggestion, not a rule**: the stored inverse is whatever the caller sends, and this only fills
 * it in when they send nothing. Gendered roles invert to the neutral term (`mother` → `child`, never
 * `son`), because which one is right isn't knowable from here — a contact carries no sex. The web
 * prefills its second select from this same map, so the pairing can't drift between the two halves.
 */
export const INVERSE_ROLE: Record<ContactRelationRole, ContactRelationRole> = {
  spouse: 'spouse',
  husband: 'wife',
  wife: 'husband',
  partner: 'partner',
  parent: 'child',
  mother: 'child',
  father: 'child',
  child: 'parent',
  son: 'parent',
  daughter: 'parent',
  sibling: 'sibling',
  brother: 'sibling',
  sister: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  aunt_uncle: 'niece_nephew',
  niece_nephew: 'aunt_uncle',
  cousin: 'cousin',
  friend: 'friend',
  neighbour: 'neighbour',
  colleague: 'colleague',
  other: 'other',
};
