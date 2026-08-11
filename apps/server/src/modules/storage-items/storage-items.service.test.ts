import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { beforeAll, describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { StorageItemsService } from '#modules/storage-items/storage-items.service';

/**
 * The storage defences no E2E flow can reach: a cross-household id, and what a database does to a
 * loan when the contact it names is deleted. Both are assertions about the DB's own behaviour —
 * a foreign key's `SET NULL` and a check constraint — so they need a real Postgres, not a stub.
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

  return { householdId: household!.id, userId: owner!.id };
}

async function createLocation(householdId: number, name: string) {
  const [location] = await db.insert(schema.storageLocation).values({ householdId, name }).returning();

  return location!.id;
}

let ours: { householdId: number; userId: string };
let theirs: { householdId: number; userId: string };
let ourLocation: number;
let theirLocation: number;

beforeAll(async () => {
  [ours, theirs] = await Promise.all([createHousehold('storage'), createHousehold('storage-other')]);
  [ourLocation, theirLocation] = await Promise.all([
    createLocation(ours.householdId, `Garage ${randomUUID()}`),
    createLocation(theirs.householdId, `Garage ${randomUUID()}`),
  ]);
});

describe('household scoping', () => {
  it('should refuse to file an item into another household’s location', async () => {
    // GIVEN: a location that belongs to somebody else
    // WHEN: an item is created against it
    const create = StorageItemsService.create(
      ours.householdId,
      { locationId: theirLocation, name: 'Trespassing tent' },
      ours.userId
    );

    // THEN: it should 404 rather than leak that the location exists
    await expect(create).rejects.toThrow(HTTPException);
    await expect(create).rejects.toMatchObject({ status: 404 });
  });

  it('should refuse to move an item into another household’s location', async () => {
    // GIVEN: one of our own items
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Drill ${randomUUID()}` },
      ours.userId
    );

    // WHEN: it is moved somewhere outside the household
    const move = StorageItemsService.patch(ours.householdId, item.id, { locationId: theirLocation });

    // THEN: it should 404, and the item should stay where it was
    await expect(move).rejects.toMatchObject({ status: 404 });
    const unmoved = await db.query.storageItem.findFirst({ where: eq(schema.storageItem.id, item.id) });
    expect(unmoved?.locationId).toBe(ourLocation);
  });

  it('should not find another household’s item by id', async () => {
    // GIVEN: an item belonging to somebody else
    const item = await StorageItemsService.create(
      theirs.householdId,
      { locationId: theirLocation, name: `Ladder ${randomUUID()}` },
      theirs.userId
    );

    // WHEN: we ask for it with our own household id
    // THEN: it should 404 rather than answer
    await expect(StorageItemsService.patch(ours.householdId, item.id, { name: 'Mine now' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('a loan whose contact is deleted', () => {
  it('should keep naming the borrower', async () => {
    // GIVEN: an item lent to a contact created with the loan
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Pressure washer ${randomUUID()}` },
      ours.userId
    );
    const { item: lent } = await StorageItemsService.lend(ours.householdId, item.id, {
      contact: { name: 'Ana Novak', type: 'other', phone: '+386 40 000 000' },
      dueOn: '2099-01-01',
    });

    expect(lent.loan).toMatchObject({ name: 'Ana Novak', phone: '+386 40 000 000' });
    const contactId = lent.loan?.contactId;
    expect(contactId).toBeTypeOf('number');

    // WHEN: that contact is deleted from the address book
    await db.delete(schema.contact).where(eq(schema.contact.id, contactId!));

    // THEN: the loan should survive it — the FK nulls, the stored name is what's left, and the check
    // constraint is satisfied because that name was written alongside the link rather than derived
    const after = await db.query.storageItem.findFirst({ where: eq(schema.storageItem.id, item.id) });
    expect(after).toMatchObject({ borrowedByContactId: null, borrowedByName: 'Ana Novak', dueOn: '2099-01-01' });
  });
});

describe('lending something that is already out', () => {
  it('should refuse it, and mint nobody for the loan it refused', async () => {
    // GIVEN: an item already out with somebody
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Extension ladder ${randomUUID()}` },
      ours.userId
    );
    await StorageItemsService.lend(ours.householdId, item.id, {
      contact: { name: 'First Borrower', type: 'other' },
    });

    // WHEN: a second loan is filed against it — the UI only offers this on an item that is here, so
    // reaching it means two people acted at once, or something called the endpoint directly
    const second = StorageItemsService.lend(ours.householdId, item.id, {
      contact: { name: `Second Borrower ${randomUUID()}`, type: 'other' },
    });

    // THEN: it should be refused rather than quietly replacing whoever has it
    await expect(second).rejects.toThrow(HTTPException);
    await expect(second).rejects.toMatchObject({ status: 409 });

    const after = await db.query.storageItem.findFirst({ where: eq(schema.storageItem.id, item.id) });
    expect(after?.borrowedByName).toBe('First Borrower');

    // AND: the contact the refused loan would have created should not be in the address book — the
    // refusal lands before the transaction that would have minted it
    const contacts = await db.query.contact.findMany({
      where: eq(schema.contact.householdId, ours.householdId),
    });
    expect(contacts.filter((contact) => contact.name.startsWith('Second Borrower'))).toHaveLength(0);
  });

  /**
   * The same refusal from the other branch. The check above runs before the transaction, so it can
   * only speak for the moment before it — two loans filed at once both pass it, and the second is
   * caught by the `isNull` in the update's own `WHERE`. That branch used to answer 404, which is a
   * lie about an item that exists and is in somebody's hands.
   */
  it('should refuse the loser of a race with a conflict, not a 404', async () => {
    // GIVEN: an item that is here
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Pressure washer ${randomUUID()}` },
      ours.userId
    );

    // WHEN: two loans are filed against it at once, so both read it as available before either writes
    const [first, second] = await Promise.allSettled([
      StorageItemsService.lend(ours.householdId, item.id, { contact: { name: 'Racer One', type: 'other' } }),
      StorageItemsService.lend(ours.householdId, item.id, { contact: { name: 'Racer Two', type: 'other' } }),
    ]);

    // THEN: exactly one should win
    const winners = [first, second].filter((result) => result.status === 'fulfilled');
    const losers = [first, second].filter((result) => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // AND: the loser should be told the item is taken, not that it is missing
    expect(losers[0]!.reason).toBeInstanceOf(HTTPException);
    expect(losers[0]!.reason).toMatchObject({ status: 409 });

    // AND: the item should be out with whoever won, and nobody else
    const after = await db.query.storageItem.findFirst({ where: eq(schema.storageItem.id, item.id) });
    expect(['Racer One', 'Racer Two']).toContain(after?.borrowedByName);
  });
});

describe('the loan check constraint', () => {
  it('should refuse a loan that names nobody', async () => {
    // GIVEN: an item that is here
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Wheelbarrow ${randomUUID()}` },
      ours.userId
    );

    // WHEN: a borrow date is written without a borrower — which no endpoint does, and which is
    // exactly why the constraint is the thing being tested
    const write = db
      .update(schema.storageItem)
      .set({ borrowedOn: '2026-01-01' })
      .where(eq(schema.storageItem.id, item.id));

    // THEN: the database should refuse it
    await expect(write).rejects.toThrow();
  });

  it('should refuse loan dates on an item that is not out', async () => {
    // GIVEN: an item that is here
    const item = await StorageItemsService.create(
      ours.householdId,
      { locationId: ourLocation, name: `Sack truck ${randomUUID()}` },
      ours.userId
    );

    // WHEN: a due date is set without the item being lent
    const write = db.update(schema.storageItem).set({ dueOn: '2026-01-01' }).where(eq(schema.storageItem.id, item.id));

    // THEN: the database should refuse it
    await expect(write).rejects.toThrow();
  });
});
