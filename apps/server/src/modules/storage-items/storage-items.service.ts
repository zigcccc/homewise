import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '#db/core';
import { changedColumns, emptyToNull, type Filters, writesAnything } from '#db/utils';
import { blobPrefix } from '#lib/blobs';
import { todayISO } from '#lib/dates';
import { notFound, somethingWentWrong } from '#lib/errors';
import { type FieldChange } from '#lib/models';
import { ContactsService } from '#modules/contacts/contacts.service';
import { ImagesService } from '#modules/images/images.service';
import { StorageLocationsService } from '#modules/storage-locations/storage-locations.service';

import {
  type CreateStorageItem,
  type LendStorageItem,
  type ListStorageItemsQueryParams,
  type PatchStorageItem,
} from './storage-items.model';

/** The joins every item response carries: where it is, and who has it. */
const itemWith = {
  location: { columns: { id: true, name: true } },
  borrower: { columns: { id: true, name: true, email: true, phone: true } },
} as const;

/** The loan columns and the contact join, as any read of the table produces them. */
type ItemLoanRow = {
  borrower: { id: number; name: string; email: string | null; phone: string | null } | null;
  borrowedByContactId: number | null;
  borrowedByName: string | null;
  borrowedOn: string | null;
  dueOn: string | null;
};

/** One phrasing for the refusal, raised both before the write and by the loser of a race for it. */
function alreadyOnLoan(name: string) {
  return new HTTPException(409, { message: `"${name}" is already out on loan.` });
}

export class StorageItemsService {
  /**
   * Flattens the loan into one nullable object, so "is it out" is a single question rather than four
   * columns every client has to agree how to read.
   *
   * The `borrowedByName` check is a narrowing, not a fallback: the check constraint makes it non-null
   * for exactly the rows where `borrowedOn` is. The joined contact's name wins so a rename shows up,
   * and the stored one is what remains once that contact is deleted.
   */
  private static toResponse<T extends ItemLoanRow>(item: T) {
    const { borrower, borrowedByContactId, borrowedByName, borrowedOn, dueOn, ...rest } = item;

    return {
      ...rest,
      loan:
        borrowedOn === null || borrowedByName === null
          ? null
          : {
              borrowedOn,
              dueOn,
              contactId: borrowedByContactId,
              name: borrower?.name ?? borrowedByName,
              email: borrower?.email ?? null,
              phone: borrower?.phone ?? null,
            },
    };
  }

  /** Existence + household-scoping check, without the joins a response needs. */
  private static async readItemRow(householdId: number, itemId: number) {
    const item = await db.query.storageItem.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, itemId)),
    });

    if (!item) {
      throw notFound('Item');
    }

    return item;
  }

  /** Re-reads an item with its joins, so every mutation returns exactly what the list returns. */
  private static async readItemWithRelations(householdId: number, itemId: number) {
    const item = await db.query.storageItem.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, itemId)),
      with: itemWith,
    });

    if (!item) {
      throw notFound('Item');
    }

    return item;
  }

  private static async read(householdId: number, itemId: number) {
    return StorageItemsService.toResponse(await StorageItemsService.readItemWithRelations(householdId, itemId));
  }

  /**
   * Everything the household stores, optionally narrowed to one location. The unnarrowed read is the
   * primary one — "where is the tent" is a question about every location at once.
   */
  public static async list(
    householdId: number,
    { search, locationId, loanStatus, sortKey, sortDirection }: ListStorageItemsQueryParams
  ) {
    const columns = schema.storageItem;
    const filters: Filters = [eq(columns.householdId, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(or(ilike(columns.name, term), ilike(columns.notes, term)));
    }

    if (locationId !== undefined) {
      filters.push(eq(columns.locationId, locationId));
    }

    if (loanStatus === 'available') {
      filters.push(isNull(columns.borrowedOn));
    } else if (loanStatus === 'onLoan') {
      filters.push(isNotNull(columns.borrowedOn));
    } else if (loanStatus === 'overdue') {
      filters.push(and(isNotNull(columns.borrowedOn), lt(columns.dueOn, todayISO())));
    }

    const sortColumn = columns[sortKey];
    const items = await db.query.storageItem.findMany({
      where: and(...filters),
      // The id breaks ties, so the many rows sharing a sort key — every item with no due date — don't
      // reshuffle between two identical requests.
      orderBy: [sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn), asc(columns.id)],
      with: itemWith,
    });

    return items.map((item) => StorageItemsService.toResponse(item));
  }

  public static async create(householdId: number, data: CreateStorageItem, userId: string) {
    // Throws 404 when the location belongs to a different household.
    await StorageLocationsService.assertInHousehold(householdId, data.locationId);

    // The photo is uploaded before the row exists, so a failed insert has to drop it again — which is
    // exactly what `commitManagedImage` does with the rollback half of the resolved update.
    const photo = await ImagesService.resolveManagedImage({ image: data.image }, null, {
      ownedPrefix: blobPrefix.storageItemPhoto(householdId),
      size: 512,
    });

    let itemId: number | undefined;
    await ImagesService.commitManagedImage(photo, async () => {
      const [row] = await db
        .insert(schema.storageItem)
        .values({
          householdId,
          locationId: data.locationId,
          name: data.name,
          notes: emptyToNull(data.notes),
          quantity: data.quantity,
          photoUrl: photo.changed ? photo.value : null,
          createdBy: userId,
        })
        .returning({ id: schema.storageItem.id });

      itemId = row?.id;

      return Boolean(row);
    });

    if (itemId === undefined) {
      throw somethingWentWrong();
    }

    return StorageItemsService.read(householdId, itemId);
  }

  public static async patch(householdId: number, itemId: number, data: PatchStorageItem) {
    const existing = await StorageItemsService.readItemRow(householdId, itemId);

    if (data.locationId !== undefined) {
      await StorageLocationsService.assertInHousehold(householdId, data.locationId);
    }

    const set: Partial<typeof schema.storageItem.$inferInsert> = {
      // Passing a location is the move: nothing else about the item changes, and the item's own
      // household is invariant, so there is no resequencing to do on either side.
      locationId: data.locationId,
      name: data.name,
      notes: emptyToNull(data.notes),
      quantity: data.quantity,
    };

    const photo = await ImagesService.resolveManagedImage({ image: data.image }, existing.photoUrl, {
      ownedPrefix: blobPrefix.storageItemPhoto(householdId),
      size: 512,
    });
    // Taken before the photo joins the set — a blob URL is not something to read in a feed.
    const changeset = changedColumns(existing, set);

    if (photo.changed) {
      set.photoUrl = photo.value;
      changeset.push({ field: 'photoUrl' });
    }

    if (!writesAnything(set)) {
      return { data: await StorageItemsService.read(householdId, itemId), changeset };
    }

    const persisted = await ImagesService.commitManagedImage(photo, async () => {
      const [row] = await db
        .update(schema.storageItem)
        .set(set)
        .where(and(eq(schema.storageItem.householdId, householdId), eq(schema.storageItem.id, itemId)))
        .returning({ id: schema.storageItem.id });

      return Boolean(row);
    });

    // Zero rows means the item was deleted concurrently — the replacement blob was already rolled back.
    if (!persisted) {
      throw notFound('Item');
    }

    return { data: await StorageItemsService.read(householdId, itemId), changeset };
  }

  /**
   * Lends the item out, either to a contact the household already has or to one created with the
   * loan. Both halves run in one transaction: a contact minted for a loan that then fails to land is
   * an address-book entry nobody asked for.
   *
   * Reports whether a contact was created, so the route knows to announce that too.
   */
  public static async lend(householdId: number, itemId: number, data: LendStorageItem) {
    const item = await StorageItemsService.readItemRow(householdId, itemId);

    if (item.borrowedOn !== null) {
      throw alreadyOnLoan(item.name);
    }

    const createdContact = 'contact' in data;
    // Filled inside the transaction: the borrower is only resolved (or minted) there.
    let changeset: FieldChange[] = [];

    await db.transaction(async (tx) => {
      const borrower = createdContact
        ? await ContactsService.create(householdId, data.contact, tx)
        : await ContactsService.readContactRow(householdId, data.contactId, tx);

      const set = {
        borrowedByContactId: borrower.id,
        // Stored beside the link so a later contact deletion leaves a name rather than a hole.
        borrowedByName: borrower.name,
        borrowedOn: data.borrowedOn ?? todayISO(),
        dueOn: emptyToNull(data.dueOn) ?? null,
      };

      changeset = changedColumns(item, set);

      const [updated] = await tx
        .update(schema.storageItem)
        .set(set)
        // `isNull` repeats the check above deliberately: that one read outside this transaction, so
        // it can only speak for the moment before it. This is what makes one loan win a race.
        .where(
          and(
            eq(schema.storageItem.householdId, householdId),
            eq(schema.storageItem.id, itemId),
            isNull(schema.storageItem.borrowedOn)
          )
        )
        .returning({ id: schema.storageItem.id });

      // Nothing to lend any more, and the two ways that happens are different answers: the item was
      // deleted, or somebody else lent it in between. Telling the loser of a race that the item does
      // not exist would send them looking for a thing that is sitting in a colleague's hands, so the
      // row is asked for again rather than assumed gone. Throwing either way is also what takes a
      // contact minted for this loan back out with it.
      if (!updated) {
        const current = await tx.query.storageItem.findFirst({
          columns: { name: true },
          where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, itemId)),
        });

        throw current ? alreadyOnLoan(current.name) : notFound('Item');
      }
    });

    return { data: await StorageItemsService.read(householdId, itemId), changeset, createdContact };
  }

  /** Marks the item back in. The loan is not history — there is one current answer, or none. */
  public static async markReturned(householdId: number, itemId: number) {
    // Read first: after the update there is nothing on the row to name the borrower with.
    const existing = await StorageItemsService.readItemRow(householdId, itemId);
    const set = { borrowedByContactId: null, borrowedByName: null, borrowedOn: null, dueOn: null };

    const [updated] = await db
      .update(schema.storageItem)
      .set(set)
      .where(and(eq(schema.storageItem.householdId, householdId), eq(schema.storageItem.id, itemId)))
      .returning({ id: schema.storageItem.id });

    if (!updated) {
      throw notFound('Item');
    }

    return { data: await StorageItemsService.read(householdId, itemId), changeset: changedColumns(existing, set) };
  }

  public static async delete(householdId: number, itemId: number) {
    const [deleted] = await db
      .delete(schema.storageItem)
      .where(and(eq(schema.storageItem.householdId, householdId), eq(schema.storageItem.id, itemId)))
      .returning();

    if (!deleted) {
      throw notFound('Item');
    }

    // The row is already gone — cleanup is best-effort and guarded to our own uploads.
    await ImagesService.cleanupOwnedImage(deleted.photoUrl, blobPrefix.storageItemPhoto(householdId));

    return deleted;
  }
}
