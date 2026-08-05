import { and, eq } from 'drizzle-orm';

import { db, schema } from '#db/core';
import { type Executor, emptyToNull } from '#db/utils';
import { notFound, somethingWentWrong } from '#lib/errors';

import { type ContactLink, type CreateContact, type PatchContact } from './contacts.model';

/** Standalone household contacts (address-book entries). Owner features attach them via join tables. */
export class ContactsService {
  /** Re-reads a contact with its links, so every mutation returns the same shape reads/nests produce. */
  private static async readContactWithLinks(householdId: number, contactId: number, executor: Executor = db) {
    const contact = await executor.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
      with: { links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] } },
    });

    if (!contact) {
      throw notFound('Contact');
    }

    return contact;
  }

  /** Inserts a contact's links, if any. */
  private static async insertLinks(executor: Executor, contactId: number, links: ContactLink[] | undefined) {
    if (links && links.length > 0) {
      await executor
        .insert(schema.contactLink)
        .values(links.map((link) => ({ contactId, name: link.name, url: link.url, type: link.type })));
    }
  }

  /** All contacts in the household, for the address-book / picker. Ordered by name. */
  public static async list(householdId: number) {
    return db.query.contact.findMany({
      where: (fields, { eq }) => eq(fields.householdId, householdId),
      orderBy: (fields, { asc }) => [asc(fields.name)],
      with: { links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] } },
    });
  }

  /** Resolves a contact, scoped to its household so ids from elsewhere 404. */
  private static async readContactRow(householdId: number, contactId: number) {
    const contact = await db.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
    });

    if (!contact) {
      throw notFound('Contact');
    }

    return contact;
  }

  /** Creates a contact and its links. Accepts an `executor` so an owner can create-and-link atomically. */
  public static async create(householdId: number, data: CreateContact, executor: Executor = db) {
    const [created] = await executor
      .insert(schema.contact)
      .values({
        householdId,
        type: data.type,
        name: data.name,
        description: emptyToNull(data.description),
        email: emptyToNull(data.email),
        phone: emptyToNull(data.phone),
        address: emptyToNull(data.address),
      })
      .returning();

    if (!created) {
      throw somethingWentWrong();
    }

    await ContactsService.insertLinks(executor, created.id, data.links);

    return ContactsService.readContactWithLinks(householdId, created.id, executor);
  }

  public static async patch(householdId: number, contactId: number, data: PatchContact) {
    await ContactsService.readContactRow(householdId, contactId);

    const set = {
      type: data.type,
      name: data.name,
      description: emptyToNull(data.description),
      email: emptyToNull(data.email),
      phone: emptyToNull(data.phone),
      address: emptyToNull(data.address),
    };

    await db.transaction(async (tx) => {
      // Skip the update when only links changed — an all-undefined `set` has nothing to write.
      if (Object.values(set).some((value) => value !== undefined)) {
        await tx
          .update(schema.contact)
          .set(set)
          .where(and(eq(schema.contact.householdId, householdId), eq(schema.contact.id, contactId)));
      }

      // Links are replace-all: the submitted list becomes the contact's full set.
      if (data.links !== undefined) {
        await tx.delete(schema.contactLink).where(eq(schema.contactLink.contactId, contactId));
        await ContactsService.insertLinks(tx, contactId, data.links);
      }
    });

    return ContactsService.readContactWithLinks(householdId, contactId);
  }

  public static async delete(householdId: number, contactId: number) {
    const [deleted] = await db
      .delete(schema.contact)
      .where(and(eq(schema.contact.householdId, householdId), eq(schema.contact.id, contactId)))
      .returning();

    if (!deleted) {
      throw notFound('Contact');
    }

    return deleted;
  }
}
