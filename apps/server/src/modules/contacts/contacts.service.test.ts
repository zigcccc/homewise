import { randomUUID } from 'node:crypto';

import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { db, schema } from '#db/core';
import { ContactsService } from '#modules/contacts/contacts.service';

/**
 * The three things about contacts that a browser can't be pointed at.
 *
 * The birthday ordering wraps the turn of the year, which through the UI would mean waiting for
 * December; the mirrored-pair refusal is a database constraint the interface gives you no way to
 * breach; and the role flip is a claim about what one stored row looks like from its *other* end,
 * which no single page shows. Everything else contacts do is `contacts.spec.ts`'s job.
 */

/** A household of this file's own, so it can't collide with another test file's rows. */
async function createHousehold(label: string) {
  const suffix = randomUUID();
  const [owner] = await db
    .insert(schema.user)
    .values({ email: `${label}-${suffix}@example.test`, id: `user-${label}-${suffix}`, name: 'Test Owner' })
    .returning();
  const [household] = await db
    .insert(schema.household)
    .values({ name: `${label} ${suffix}`, ownerId: owner!.id })
    .returning();

  return household!.id;
}

const createContact = (householdId: number, name: string, dateOfBirth?: string) =>
  ContactsService.create(householdId, { type: 'friend', name, dateOfBirth });

describe('ContactsService.list sorted by birthday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should order by whose birthday is next, wrapping into the new year', async () => {
    // GIVEN: a household whose contacts were born across the calendar, and a clock pinned to mid-June.
    // Only `Date` is faked: the pg pool wants its own timers, and the ordering reads the clock in
    // JS and binds it as a parameter rather than asking Postgres for `current_date`.
    const householdId = await createHousehold('birthdays');
    const suffix = randomUUID();

    await Promise.all([
      createContact(householdId, `Later this year ${suffix}`, '1985-12-31'),
      createContact(householdId, `Already been ${suffix}`, '2000-01-05'),
      createContact(householdId, `Today ${suffix}`, '1975-06-15'),
      createContact(householdId, `In five days ${suffix}`, '1990-06-20'),
      createContact(householdId, `No birthday ${suffix}`),
    ]);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:00:00Z'));

    // WHEN: the address book is sorted by birthday
    const contacts = await ContactsService.list(householdId, { sortKey: 'birthday', sortDirection: 'asc' });

    // THEN: it should read forwards from today — and the January birthday, which holds the *smallest*
    // date of the five, should come last of the dated ones rather than first
    expect(contacts.map((contact) => contact.name)).toEqual([
      `Today ${suffix}`,
      `In five days ${suffix}`,
      `Later this year ${suffix}`,
      `Already been ${suffix}`,
      `No birthday ${suffix}`,
    ]);
  });

  it('should keep contacts without a birthday last whichever way the sort points', async () => {
    // GIVEN: a household holding one dated contact and one without
    const householdId = await createHousehold('birthdays-null');
    const suffix = randomUUID();
    await createContact(householdId, `Dated ${suffix}`, '1990-03-02');
    await createContact(householdId, `Undated ${suffix}`);

    // WHEN: the list is sorted descending
    const contacts = await ContactsService.list(householdId, { sortKey: 'birthday', sortDirection: 'desc' });

    // THEN: the undated one should still trail — an empty column is not a value to sort into the middle
    expect(contacts.map((contact) => contact.name)).toEqual([`Dated ${suffix}`, `Undated ${suffix}`]);
  });
});

describe('ContactsService.addRelation', () => {
  let householdId: number;

  beforeAll(async () => {
    householdId = await createHousehold('relations');
  });

  it('should refuse the same pair entered from the other end', async () => {
    // GIVEN: two contacts already related
    const suffix = randomUUID();
    const sarah = await createContact(householdId, `Sarah ${suffix}`);
    const john = await createContact(householdId, `John ${suffix}`);
    await ContactsService.addRelation(householdId, sarah.id, { relatedContactId: john.id, role: 'husband' });

    // WHEN: the mirrored relation is added from John's side
    const raised = await ContactsService.addRelation(householdId, john.id, {
      relatedContactId: sarah.id,
      role: 'wife',
    }).catch((error: unknown) => error);

    // THEN: it should be refused as a duplicate rather than stored as a second row — the pair index is
    // keyed on least/greatest precisely so the direction can't smuggle the same fact in twice
    if (!(raised instanceof HTTPException)) {
      throw new Error(`Expected the mirrored relation to be refused, got ${String(raised)}`);
    }

    expect(raised.status).toBe(409);

    const rows = await db.query.contactRelation.findMany({
      where: (relation, { eq }) => eq(relation.contactId, sarah.id),
    });
    expect(rows).toHaveLength(1);
  });

  it('should refuse a contact related to itself', async () => {
    // GIVEN: a contact
    const suffix = randomUUID();
    const contact = await createContact(householdId, `Solo ${suffix}`);

    // WHEN: it is related to itself
    const raised = await ContactsService.addRelation(householdId, contact.id, {
      relatedContactId: contact.id,
      role: 'sibling',
    }).catch((error: unknown) => error);

    // THEN: it should be a 400 with something to read, not the 500 a breached check constraint gives
    if (!(raised instanceof HTTPException)) {
      throw new Error(`Expected a self-relation to be refused, got ${String(raised)}`);
    }

    expect(raised.status).toBe(400);
  });

  it('should refuse a contact from another household', async () => {
    // GIVEN: a contact here and one belonging to somebody else
    const suffix = randomUUID();
    const mine = await createContact(householdId, `Mine ${suffix}`);
    const theirs = await createContact(await createHousehold('relations-other'), `Theirs ${suffix}`);

    // WHEN: the foreign contact is related to ours
    const raised = await ContactsService.addRelation(householdId, mine.id, {
      relatedContactId: theirs.id,
      role: 'friend',
    }).catch((error: unknown) => error);

    // THEN: it should 404 rather than confirm the id exists somewhere
    if (!(raised instanceof HTTPException)) {
      throw new Error(`Expected a cross-household relation to be refused, got ${String(raised)}`);
    }

    expect(raised.status).toBe(404);
  });

  it('should fill in the opposite role when none is given', async () => {
    // GIVEN: two contacts
    const suffix = randomUUID();
    const parent = await createContact(householdId, `Parent ${suffix}`);
    const kid = await createContact(householdId, `Kid ${suffix}`);

    // WHEN: one is recorded as the other's daughter, saying nothing about the reverse
    await ContactsService.addRelation(householdId, parent.id, { relatedContactId: kid.id, role: 'daughter' });

    // THEN: the reverse should default to the neutral term, since a contact carries no sex to pick from
    const [relation] = await db.query.contactRelation.findMany({
      where: (row, { eq }) => eq(row.contactId, parent.id),
    });
    expect(relation?.inverseRole).toBe('parent');
  });
});

describe('a stored relation read from both ends', () => {
  it('should report each contact the role that describes the other', async () => {
    // GIVEN: one row saying John is Sarah's husband, and Sarah John's wife
    const householdId = await createHousehold('relation-frames');
    const suffix = randomUUID();
    const sarah = await createContact(householdId, `Sarah ${suffix}`);
    const john = await createContact(householdId, `John ${suffix}`);
    await ContactsService.addRelation(householdId, sarah.id, {
      relatedContactId: john.id,
      role: 'husband',
      inverseRole: 'wife',
    });

    // WHEN: each contact is read
    const [fromSarah, fromJohn] = await Promise.all([
      ContactsService.read(householdId, sarah.id),
      ContactsService.read(householdId, john.id),
    ]);

    // THEN: each should see the other, described from its own side of the one row
    expect(fromSarah.relations).toEqual([
      expect.objectContaining({ role: 'husband', contact: expect.objectContaining({ id: john.id }) }),
    ]);
    expect(fromJohn.relations).toEqual([
      expect.objectContaining({ role: 'wife', contact: expect.objectContaining({ id: sarah.id }) }),
    ]);
  });

  it('should take an edit stated from the far end and store it the right way round', async () => {
    // GIVEN: a relation entered from Sarah's side
    const householdId = await createHousehold('relation-patch');
    const suffix = randomUUID();
    const sarah = await createContact(householdId, `Sarah ${suffix}`);
    const john = await createContact(householdId, `John ${suffix}`);
    const created = await ContactsService.addRelation(householdId, sarah.id, {
      relatedContactId: john.id,
      role: 'husband',
      inverseRole: 'wife',
    });
    const relationId = created.relations[0]!.id;

    // WHEN: John corrects what Sarah is to him — a `role` in *his* frame, which is the stored inverse
    await ContactsService.patchRelation(householdId, john.id, relationId, { role: 'partner' });

    // THEN: it should land on the inverse column, leaving what John is to Sarah untouched
    const fromSarah = await ContactsService.read(householdId, sarah.id);
    const fromJohn = await ContactsService.read(householdId, john.id);

    expect(fromJohn.relations[0]?.role).toBe('partner');
    expect(fromSarah.relations[0]?.role).toBe('husband');
  });

  it('should drop both sides when the relation is removed from either', async () => {
    // GIVEN: a relation entered from Sarah's side
    const householdId = await createHousehold('relation-remove');
    const suffix = randomUUID();
    const sarah = await createContact(householdId, `Sarah ${suffix}`);
    const john = await createContact(householdId, `John ${suffix}`);
    const created = await ContactsService.addRelation(householdId, sarah.id, {
      relatedContactId: john.id,
      role: 'husband',
    });

    // WHEN: John removes it
    await ContactsService.removeRelation(householdId, john.id, created.relations[0]!.id);

    // THEN: it should be gone from both, there having only ever been one row
    expect((await ContactsService.read(householdId, sarah.id)).relations).toEqual([]);
    expect((await ContactsService.read(householdId, john.id)).relations).toEqual([]);
  });
});
