import { describe, expect, it } from 'vitest';

import { type RelationDraft, resolveRelationChanges, toRelationDrafts } from './relations';

/**
 * The contact dialog saves relations on Save like every other field, but a relation isn't a column of
 * the contact — each change is its own request. This decides which, and every way it can be wrong is
 * silent: a missed removal leaves a relation the user deleted, and an invented one deletes a relation
 * the *other* contact recorded.
 */

const saved = (relationId: number, relatedContactId: number, role: RelationDraft['role']): RelationDraft => ({
  relationId,
  relatedContactId,
  relatedContactName: `Contact ${relatedContactId}`,
  role,
});

describe('resolveRelationChanges', () => {
  it('should ask for nothing when the list is untouched', () => {
    const existing = [saved(1, 10, 'husband'), saved(2, 11, 'sibling')];

    expect(resolveRelationChanges(existing, existing)).toEqual({ added: [], changed: [], removed: [] });
  });

  it('should add the entries that carry no relation id yet', () => {
    // GIVEN: one stored relation, and a second just picked in the dialog
    const stored = saved(1, 10, 'husband');
    const picked: RelationDraft = { relatedContactId: 12, relatedContactName: 'Contact 12', role: 'daughter' };

    // WHEN / THEN: only the new one should be posted, and nothing else disturbed
    const { added, changed, removed } = resolveRelationChanges([stored], [stored, picked]);

    expect(added).toEqual([picked]);
    expect(changed).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('should remove the stored entries the form no longer lists', () => {
    const kept = saved(1, 10, 'husband');
    const dropped = saved(2, 11, 'sibling');

    const { added, changed, removed } = resolveRelationChanges([kept, dropped], [kept]);

    expect(removed).toEqual([dropped]);
    expect(added).toEqual([]);
    expect(changed).toEqual([]);
  });

  it('should patch only the entries whose role actually moved', () => {
    // GIVEN: two stored relations, one of which is re-worded
    const untouched = saved(1, 10, 'husband');
    const before = saved(2, 11, 'sibling');
    const after = saved(2, 11, 'brother');

    // WHEN / THEN: the unchanged one should cost no request — a patch per row on every save would
    // rewrite relations nobody edited
    const { added, changed, removed } = resolveRelationChanges([untouched, before], [untouched, after]);

    expect(changed).toEqual([after]);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('should handle a removal and an addition in the same save', () => {
    const dropped = saved(1, 10, 'husband');
    const picked: RelationDraft = { relatedContactId: 12, relatedContactName: 'Contact 12', role: 'friend' };

    const { added, changed, removed } = resolveRelationChanges([dropped], [picked]);

    expect(removed).toEqual([dropped]);
    expect(added).toEqual([picked]);
    expect(changed).toEqual([]);
  });

  it('should treat a relation entered from the other contact’s side as an ordinary stored one', () => {
    // GIVEN: a relation the *other* contact created — it arrives here already turned to face this
    // one, so the form has no way to tell, and must not
    const fromTheOtherSide = saved(7, 20, 'wife');

    // WHEN: it is dropped from the list
    const { removed } = resolveRelationChanges([fromTheOtherSide], []);

    // THEN: it should be removed by its own id, not re-created in the opposite direction
    expect(removed).toEqual([fromTheOtherSide]);
  });
});

describe('toRelationDrafts', () => {
  it('should carry the relation id and the far contact through', () => {
    const drafts = toRelationDrafts([
      { id: 3, role: 'mother', contact: { id: 14, name: 'Ana', type: 'family', dateOfBirth: '1962-04-02' } },
    ]);

    expect(drafts).toEqual([{ relationId: 3, relatedContactId: 14, relatedContactName: 'Ana', role: 'mother' }]);
  });
});
