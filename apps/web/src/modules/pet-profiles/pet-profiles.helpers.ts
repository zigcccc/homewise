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

/** A "Dog · Golden Retriever" line — type, breed, or both. Null when neither is set. */
export function typeAndBreed(type: PetType | null, breed: string | null) {
  const label = type ? petTypeLabels[type] : null;

  return [label, breed].filter(Boolean).join(' · ') || null;
}
