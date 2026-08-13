import { describe, expect, it } from 'vitest';

import { householdEventEntity } from '@homewise/server/realtime';

import { ACTIVITY_ENTITY_FILTER_LABELS, ACTIVITY_ENTITY_NOUNS, activityAction, actorInitials } from './labels';

describe('the entity label records', () => {
  /**
   * The `Record` types already force a key per entity at compile time; this catches the other half —
   * a key present but left blank, which type-checks and renders "Žiga added ".
   */
  it.each(householdEventEntity.options)('should name %s in both records', (entity) => {
    expect(ACTIVITY_ENTITY_NOUNS[entity]).toMatch(/\S/);
    expect(ACTIVITY_ENTITY_FILTER_LABELS[entity]).toMatch(/\S/);
  });
});

describe('activityAction', () => {
  it.each([
    ['create', 'added the contact'],
    ['update', 'updated the contact'],
    ['delete', 'removed the contact'],
  ] as const)('should read %s as "%s"', (operation, expected) => {
    expect(activityAction('contact', operation, 1)).toBe(expected);
  });

  it('should read a deleted expense as removed rather than deleted', () => {
    // The household is telling itself what happened, not reading a changelog.
    expect(activityAction('expense', 'delete', 1)).toBe('removed the expense');
  });

  it('should count a folded run instead of repeating the same sentence', () => {
    // The line five saves of one profile has to make, or the feed is five identical rows.
    expect(activityAction('child_profile', 'update', 5)).toBe('made 5 updates to the kid profile');
  });

  it('should still read as one change at a count of one', () => {
    // The boundary: `count` is 1 on every row that never folded, which is nearly all of them.
    expect(activityAction('child_profile', 'update', 1)).toBe('updated the kid profile');
  });
});

describe('actorInitials', () => {
  it.each([
    ['Žiga Krašovec', 'ŽK'],
    ['Preview User', 'PU'],
    // One name, so there is only one letter to take.
    ['Robin', 'R'],
    // Extra spacing must not become an empty second initial.
    ['  Ana   Novak  ', 'AN'],
  ])('should turn %s into %s', (name, expected) => {
    expect(actorInitials(name)).toBe(expected);
  });

  it('should fall back to a placeholder rather than rendering an empty avatar', () => {
    // `actorName` is a snapshot of whatever the account was called, so it is not ours to trust.
    expect(actorInitials('   ')).toBe('?');
  });
});
