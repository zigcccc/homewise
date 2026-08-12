import { type ContactRelationRole } from '@homewise/server/contacts';

import { parseResponse } from '@/api/client';

import {
  $addContactRelation,
  $patchContactRelation,
  $removeContactRelation,
  type ContactRelation,
} from '../contacts.queries';

/** A relation as the contact form carries it. No `relationId` means it hasn't been saved yet. */
export type RelationDraft = {
  relationId?: number;
  relatedContactId: number;
  relatedContactName: string;
  role: ContactRelationRole;
};

/**
 * Takes relations as the detail response reports them — already turned to face the contact being
 * edited — and flattens each to what the form needs. Typed off the response rather than restated,
 * so a field renamed on the server surfaces here instead of compiling on a structural match.
 */
export const toRelationDrafts = (relations: ContactRelation[]): RelationDraft[] =>
  relations.map((relation) => ({
    relationId: relation.id,
    relatedContactId: relation.contact.id,
    relatedContactName: relation.contact.name,
    role: relation.role,
  }));

/**
 * What has to happen to turn the saved relations into the ones the form is holding.
 *
 * The dialog edits relations as a list and saves on Save, like every other field on it — but a
 * relation is not a column of the contact, so there is no payload that can carry the whole list.
 * Each change is its own request against the relation endpoints, and this is what decides which.
 *
 * Kept separate from the component that calls it, and pure, because getting it wrong is silent:
 * a missed `removed` leaves a relation the user deleted, and a spurious one deletes a relation the
 * *other* contact recorded.
 */
export function resolveRelationChanges(saved: RelationDraft[], next: RelationDraft[]) {
  const nextIds = new Set(next.map((relation) => relation.relationId).filter((id) => id !== undefined));

  return {
    added: next.filter((relation) => relation.relationId === undefined),
    removed: saved.filter((relation) => relation.relationId !== undefined && !nextIds.has(relation.relationId)),
    changed: next.filter((relation) => {
      if (relation.relationId === undefined) {
        return false;
      }

      const before = saved.find((candidate) => candidate.relationId === relation.relationId);

      return before !== undefined && before.role !== relation.role;
    }),
  };
}

/**
 * Runs the requests that make `next` true, from the frame of the contact named by `contactId`.
 *
 * Kept beside the diff it enacts rather than in the dialog that calls it — the two halves are one
 * decision, and neither is about rendering. Run in series: they touch the same rows, and a removal
 * racing its own re-add isn't worth the round trip saved.
 */
export async function applyRelationChanges(contactId: number, saved: RelationDraft[], next: RelationDraft[]) {
  const { added, changed, removed } = resolveRelationChanges(saved, next);
  const param = (relationId: number) => ({ id: contactId.toString(), relationId: relationId.toString() });

  for (const relation of removed) {
    await parseResponse($removeContactRelation({ param: param(relation.relationId!) }));
  }

  for (const relation of changed) {
    await parseResponse($patchContactRelation({ json: { role: relation.role }, param: param(relation.relationId!) }));
  }

  for (const relation of added) {
    await parseResponse(
      $addContactRelation({
        json: { relatedContactId: relation.relatedContactId, role: relation.role },
        param: { id: contactId.toString() },
      })
    );
  }
}
