import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { ActivityService } from '#modules/activity/activity.service';
import { type HouseholdEvent } from '#modules/realtime/realtime.model';
import { createHousehold } from '#tests/households';

/**
 * The feed's paging, its write filter and the folding of repeated edits, against a real Postgres.
 *
 * None of the three is something an E2E flow can pin down. Paging correctness is about what happens
 * *between* two requests — a cursor that skipped or repeated a row would still render a
 * plausible-looking list. The `label: null` rule is invisible from the outside by design: its whole
 * effect is a row that never appears. And folding turns on what the *previous* write was, which in a
 * suite whose workers share one household is not a thing a spec can hold still.
 */

/** An event with the boring fields filled in, so a case states only what it is about. */
const event = (overrides: Partial<HouseholdEvent> = {}): HouseholdEvent =>
  ({
    entity: 'contact',
    id: null,
    operation: 'create',
    label: `Thing ${randomUUID()}`,
    ...overrides,
  }) satisfies HouseholdEvent;

/**
 * A default actor. Only the *user* is shared — every case makes its own household, because a feed
 * is per household and a shared one would let cases see each other's rows.
 */
let actor: { id: string; name: string };

beforeAll(async () => {
  const created = await createHousehold('activity');
  actor = { id: created.userId, name: 'Test Owner' };
});

describe('ActivityService.record', () => {
  it('should keep an event that carries a label', async () => {
    // GIVEN: a labelled event
    const { householdId: ownHouseholdId } = await createHousehold('activity-kept');
    const label = `Kept ${randomUUID()}`;

    // WHEN: it is recorded
    await ActivityService.record(ownHouseholdId, actor, [event({ label })]);

    // THEN: it should be readable back as a feed row
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorName: 'Test Owner', label });
  });

  it('should drop an event whose label is null', async () => {
    // GIVEN: a mutation that emitted one real change and one cascade
    const { householdId: ownHouseholdId } = await createHousehold('activity-null');
    const label = `Real ${randomUUID()}`;

    // WHEN: both are recorded together
    await ActivityService.record(ownHouseholdId, actor, [
      event({ label }),
      event({ entity: 'ingredient', label: null, operation: 'update' }),
    ]);

    // THEN: only the labelled one should have become a row — the cascade is invalidation, not history
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe(label);
  });

  it('should write nothing at all when every event is unlabelled', async () => {
    // GIVEN: a household and a request that only invalidated caches
    const { householdId: ownHouseholdId } = await createHousehold('activity-silent');

    // WHEN: those events are recorded
    await ActivityService.record(ownHouseholdId, actor, [
      event({ label: null }),
      event({ entity: 'meal_plan', label: null, operation: 'update' }),
    ]);

    // THEN: the feed should still be empty
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(0);
  });

  it('should snapshot the actor name rather than joining it', async () => {
    // GIVEN: a recorded change
    const { householdId: ownHouseholdId, userId } = await createHousehold('activity-rename');
    await ActivityService.record(ownHouseholdId, { id: userId, name: 'Original Name' }, [event()]);

    // WHEN: that account is renamed afterwards
    await db.update(schema.user).set({ name: 'Renamed' }).where(eq(schema.user.id, userId));

    // THEN: the line should still say who it was at the time
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries[0]?.actorName).toBe('Original Name');
  });
});

describe('ActivityService.record folding', () => {
  /** The same save, twice: same person, same row, same wording — what a form being edited looks like. */
  const edit = (overrides: Partial<HouseholdEvent> = {}): HouseholdEvent =>
    event({ entity: 'child_profile', id: 7, label: 'John', operation: 'update', ...overrides });

  it('should count a repeated edit of the same row instead of repeating the line', async () => {
    // GIVEN: a household whose feed is empty
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold');

    // WHEN: one profile is saved three times over
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // THEN: the feed should read "made 3 updates", not the same sentence three times
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(3);
  });

  it('should leave the folded line where it is, dated by its latest edit', async () => {
    // GIVEN: one recorded edit
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-place');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    const before = (await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 })).items[0]!;

    // WHEN: the same row is edited again
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    const after = (await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 })).items[0]!;

    // THEN: it should still be the same row at the same id — the cursor pages by id, so a fold that
    // moved a line would skip or repeat one — started when it started, and dated by the last edit
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toStrictEqual(before.createdAt);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('should not fold across something that happened in between', async () => {
    // GIVEN: a profile edited, then a different one edited
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-broken');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    await ActivityService.record(ownHouseholdId, actor, [edit({ id: 8, label: 'Robbie' })]);

    // WHEN: the first one is edited again
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // THEN: it should be its own line — folding it would move it above work that came after it
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries.map((entry) => entry.label)).toStrictEqual(['John', 'Robbie', 'John']);
    expect(entries.every((entry) => entry.count === 1)).toBe(true);
  });

  it('should not fold another member into the line above', async () => {
    // GIVEN: one member's edit
    const { householdId: ownHouseholdId, userId } = await createHousehold('activity-fold-actor');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // WHEN: somebody else edits the same profile straight after
    await ActivityService.record(ownHouseholdId, { id: userId, name: 'Someone Else' }, [edit()]);

    // THEN: both should be named — a line is attributed to one person
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries.map((entry) => entry.actorName)).toStrictEqual(['Someone Else', 'Test Owner']);
  });

  it('should not fold a rename into the name it replaced', async () => {
    // GIVEN: a profile edited under one name
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-rename');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // WHEN: the same row is edited again, now called something else
    await ActivityService.record(ownHouseholdId, actor, [edit({ label: 'Jonathan' })]);

    // THEN: both names should survive — folding would silently rewrite what the earlier edit was to
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries.map((entry) => entry.label)).toStrictEqual(['Jonathan', 'John']);
  });

  it('should not fold two different rows that happen to share a name', async () => {
    // GIVEN: an edit to one of two profiles with the same name
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-namesake');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // WHEN: the other one is edited straight after
    await ActivityService.record(ownHouseholdId, actor, [edit({ id: 8 })]);

    // THEN: they should stay two lines — the name is a snapshot, the id is what says which row
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(2);
  });

  it('should never fold anything but an update', async () => {
    // GIVEN: a household, and the same creation recorded twice
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-create');
    const added = () => edit({ operation: 'create' });

    // WHEN: both are recorded back to back
    await ActivityService.record(ownHouseholdId, actor, [added()]);
    await ActivityService.record(ownHouseholdId, actor, [added()]);

    // THEN: they should stay two lines — a row can only be created once, so two of these are two
    // different things that happen to share a label
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(2);
  });

  it('should stop folding once the run has gone cold', async () => {
    // GIVEN: an edit made longer ago than a run stays open for
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-window');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);
    await db
      .update(schema.householdActivity)
      .set({ updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(schema.householdActivity.householdId, ownHouseholdId));

    // WHEN: the same profile is edited again today
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // THEN: it should be a new line — this evening's work is not this morning's, and a line has to
    // sit under the day it happened on
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(2);
  });

  it('should fold the head of a request and still write the rest', async () => {
    // GIVEN: a recorded edit
    const { householdId: ownHouseholdId } = await createHousehold('activity-fold-batch');
    await ActivityService.record(ownHouseholdId, actor, [edit()]);

    // WHEN: a request repeats it and logs a second, different effect
    await ActivityService.record(ownHouseholdId, actor, [edit(), event({ entity: 'contact', label: 'Ana Novak' })]);

    // THEN: the repeat should fold and the other effect should still get its own line
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries.map((entry) => entry.label)).toStrictEqual(['Ana Novak', 'John']);
    expect(entries[1]?.count).toBe(2);
  });
});

describe('ActivityService.record change detail', () => {
  const edit = (changes: HouseholdEvent['changes']): HouseholdEvent =>
    event({ changes, entity: 'child_profile', id: 7, label: 'John', operation: 'update' });

  it('should keep what a save changed alongside who saved it', async () => {
    // GIVEN: an edit that moved one field
    const { householdId: ownHouseholdId } = await createHousehold('activity-changes');

    // WHEN: it is recorded
    await ActivityService.record(ownHouseholdId, actor, [
      edit([{ field: 'dateOfBirth', from: '2019-07-03', to: '2019-07-04' }]),
    ]);

    // THEN: the line should be able to say what it was, not only that something happened
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries[0]?.changes).toStrictEqual([{ field: 'dateOfBirth', from: '2019-07-03', to: '2019-07-04' }]);
  });

  it('should not log a save that changed nothing', async () => {
    // GIVEN: a household with one real edit in its feed
    const { householdId: ownHouseholdId } = await createHousehold('activity-noop');
    await ActivityService.record(ownHouseholdId, actor, [edit([{ field: 'sex', from: null, to: 'male' }])]);

    // WHEN: somebody opens the same form and saves it without touching anything
    await ActivityService.record(ownHouseholdId, actor, [edit([])]);

    // THEN: the feed should be unmoved — an accepted save that wrote no column is not history, and
    // an empty diff is how that is told apart from a save nobody took a diff of
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(1);
  });

  it('should still log a change nobody took a diff of', async () => {
    // GIVEN: an event carrying no `changes` at all — a create, or an entity with no column diff
    const { householdId: ownHouseholdId } = await createHousehold('activity-nodiff');

    // WHEN: it is recorded
    await ActivityService.record(ownHouseholdId, actor, [event({ label: 'Ana Novak' })]);

    // THEN: absent must not be read as "changed nothing" — that would silence every create
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.changes).toStrictEqual([]);
  });

  it('should carry every edit of a folded run, in the order they happened', async () => {
    // GIVEN: a profile saved three times over, one field moving twice
    const { householdId: ownHouseholdId } = await createHousehold('activity-changes-fold');

    // WHEN: the run folds into one line
    await ActivityService.record(ownHouseholdId, actor, [edit([{ field: 'sex', from: null, to: 'male' }])]);
    await ActivityService.record(ownHouseholdId, actor, [
      edit([{ field: 'dateOfBirth', from: '2019-07-03', to: '2019-07-04' }]),
    ]);
    await ActivityService.record(ownHouseholdId, actor, [
      edit([{ field: 'dateOfBirth', from: '2019-07-04', to: '2019-07-05' }]),
    ]);

    // THEN: the row should hold all three, appended rather than merged — the feed collapses them for
    // reading, and only the whole sequence can say a field started at 03 and ended at 05
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.changes).toStrictEqual([
      { field: 'sex', from: null, to: 'male' },
      { field: 'dateOfBirth', from: '2019-07-03', to: '2019-07-04' },
      { field: 'dateOfBirth', from: '2019-07-04', to: '2019-07-05' },
    ]);
  });

  it('should cut a value down to something a line can hold', async () => {
    // GIVEN: a save that pasted an essay into a free-text field
    const { householdId: ownHouseholdId } = await createHousehold('activity-changes-long');
    const essay = 'x'.repeat(500);

    // WHEN: it is recorded
    await ActivityService.record(ownHouseholdId, actor, [edit([{ field: 'notes', from: null, to: essay }])]);

    // THEN: the stored value should be clipped — this table grows without bound, and a feed line is
    // one line however long the note behind it is
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20 });
    const stored = entries[0]?.changes[0]?.to;

    expect(stored).toMatch(/^x+…$/);
    expect(String(stored).length).toBeLessThan(essay.length);
  });
});

describe('ActivityService.list paging', () => {
  it('should report how many lines there are behind the page', async () => {
    // GIVEN: five recorded changes
    const { householdId: ownHouseholdId } = await createHousehold('activity-total');
    await ActivityService.record(
      ownHouseholdId,
      actor,
      Array.from({ length: 5 }, () => event())
    );

    // WHEN: they are read two at a time
    const page = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 2 });

    // THEN: the page should be short and the total should say there is more behind it
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  it('should walk the whole feed without skipping or repeating a row', async () => {
    // GIVEN: six recorded changes
    const { householdId: ownHouseholdId } = await createHousehold('activity-continue');
    await ActivityService.record(
      ownHouseholdId,
      actor,
      Array.from({ length: 6 }, () => event())
    );

    // WHEN: the feed is walked two rows at a time
    const seen: number[] = [];

    for (let page = 1; page <= 3; page++) {
      const read = await ActivityService.list(ownHouseholdId, { page, pageSize: 2 });
      seen.push(...read.items.map((entry) => entry.id));
    }

    // THEN: every row should appear exactly once, newest first — no row skipped, none repeated
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen).toStrictEqual([...seen].sort((a, b) => b - a));
  });

  it('should not repeat a row when a change lands mid-scroll', async () => {
    // GIVEN: four changes, and the first page already read
    const { householdId: ownHouseholdId } = await createHousehold('activity-concurrent');
    await ActivityService.record(
      ownHouseholdId,
      actor,
      Array.from({ length: 4 }, () => event())
    );
    const first = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 2 });
    const anchor = first.items[0]!.id;

    // WHEN: somebody else records something before the second page is asked for
    await ActivityService.record(ownHouseholdId, actor, [event({ label: 'Landed mid-scroll' })]);
    const second = await ActivityService.list(ownHouseholdId, { maxId: anchor, page: 2, pageSize: 2 });

    // THEN: the second page should hold rows the first one didn't
    const firstIds = first.items.map((entry) => entry.id);

    expect(second.items.map((entry) => entry.id).filter((id) => firstIds.includes(id))).toStrictEqual([]);

    // THEN: and the anchor is what did it — the same read without one counts from a feed that has
    // grown by a row, so the boundary slips and page one's last row is served again
    const unanchored = await ActivityService.list(ownHouseholdId, { page: 2, pageSize: 2 });

    expect(unanchored.items.map((entry) => entry.id).filter((id) => firstIds.includes(id))).not.toStrictEqual([]);
  });
});

describe('ActivityService.list filters', () => {
  it('should scope every read to one household', async () => {
    // GIVEN: two households, each with its own logged change
    const mine = await createHousehold('activity-mine');
    const theirs = await createHousehold('activity-theirs');
    await ActivityService.record(mine.householdId, actor, [event({ label: 'Mine' })]);
    await ActivityService.record(theirs.householdId, actor, [event({ label: 'Theirs' })]);

    // WHEN: one household reads its feed
    const { items: entries } = await ActivityService.list(mine.householdId, { page: 1, pageSize: 20 });

    // THEN: the other household's history should be invisible to it
    expect(entries.map((entry) => entry.label)).toStrictEqual(['Mine']);
  });

  it('should narrow by entity, actor and search together', async () => {
    // GIVEN: a household whose feed mixes kinds and people
    const { householdId: ownHouseholdId, userId } = await createHousehold('activity-filters');
    const other = { id: actor.id, name: 'Someone Else' };

    await ActivityService.record(ownHouseholdId, { id: userId, name: 'Filter Owner' }, [
      event({ entity: 'contact', label: 'Ana Novak' }),
      event({ entity: 'recipe', label: 'Ana-style pasta' }),
    ]);
    await ActivityService.record(ownHouseholdId, other, [event({ entity: 'contact', label: 'Ana Kovac' })]);

    // WHEN: all three filters are applied at once
    const { items: entries } = await ActivityService.list(ownHouseholdId, {
      actorId: userId,
      entity: 'contact',
      page: 1,
      pageSize: 20,
      search: 'ana',
    });

    // THEN: only the row satisfying every one should come back
    expect(entries.map((entry) => entry.label)).toStrictEqual(['Ana Novak']);
  });

  it('should match a search case-insensitively, anywhere in the label', async () => {
    // GIVEN: a logged change whose label is mid-sentence
    const { householdId: ownHouseholdId } = await createHousehold('activity-search');
    await ActivityService.record(ownHouseholdId, actor, [event({ label: 'The Big Garage Shelf' })]);

    // WHEN: it is searched for by a lowercase fragment
    const { items: entries } = await ActivityService.list(ownHouseholdId, { page: 1, pageSize: 20, search: 'garage' });

    // THEN: it should be found
    expect(entries).toHaveLength(1);
  });
});
