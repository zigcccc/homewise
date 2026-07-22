import { type PetType } from '@homewise/server/pet-profiles';

/** Human-readable labels for each pet type, shared by the list cards and the General form. */
export const petTypeLabels: Record<PetType, string> = {
  dog: 'Dog',
  cat: 'Cat',
  turtle: 'Turtle',
  hamster: 'Hamster',
  horse: 'Horse',
  parrot: 'Parrot',
  other: 'Other',
};
