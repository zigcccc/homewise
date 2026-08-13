import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '#db/core';
import {
  changedColumns,
  type Executor,
  emptyToNull,
  type Filters,
  isUniqueViolation,
  sameList,
  writesAnything,
} from '#db/utils';
import { todayMonthDay } from '#lib/dates';
import { alreadyExists, notFound, somethingWentWrong } from '#lib/errors';

import { INVERSE_ROLE } from './contacts.constants';
import {
  type ContactLink,
  type CreateContact,
  type CreateContactRelation,
  type ListContactsQueryParams,
  type PatchContact,
  type PatchContactRelation,
} from './contacts.model';

/** How a link is compared against the stored one: replace-all, so only its content can differ. */
const linkKey = (link: { name: string; type: string; url: string }) => `${link.type}|${link.name}|${link.url}`;

/** Enough of the far contact to name it and link to it — a relation is not a place to nest a record. */
const relatedContactColumns = { id: true, name: true, type: true, dateOfBirth: true } as const;

/** Standalone household contacts (address-book entries). Owner features attach them via join tables. */
export class ContactsService {
  /**
   * A contact and its links — the shape a contact takes wherever it is *attached* to something else:
   * nested in a profile's medical record, returned by the mutations that mint one.
   *
   * Public so those owners re-read through this rather than growing their own copy of the query.
   */
  public static async readWithLinks(householdId: number, contactId: number, executor: Executor = db) {
    const contact = await executor.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
      with: { links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] } },
    });

    if (!contact) {
      throw notFound('Contact');
    }

    return contact;
  }

  /**
   * The whole record, for the contact's own page — links *and* who it's related to.
   *
   * Deliberately not what the attached shape returns: a profile nests its medical record, which nests
   * its contacts, and hanging relations off those would put a fourth collection four levels down a
   * response that no screen reads it from. Depth is the thing that collapses an inferred RPC type.
   *
   * The two relation collections are the same table approached from opposite ends, and they collapse
   * into one list here: a row entered from the far end is reported through its `inverseRole`, so a
   * caller only ever sees "who this is, and what they are to *this* contact".
   */
  public static async read(householdId: number, contactId: number, executor: Executor = db) {
    const row = await executor.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
      with: {
        links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] },
        relationsAsContact: { with: { relatedContact: { columns: relatedContactColumns } } },
        relationsAsRelated: { with: { contact: { columns: relatedContactColumns } } },
      },
    });

    if (!row) {
      throw notFound('Contact');
    }

    const { relationsAsContact, relationsAsRelated, ...contact } = row;

    return {
      ...contact,
      relations: [
        ...relationsAsContact.map(({ id, role, relatedContact }) => ({ id, role, contact: relatedContact })),
        ...relationsAsRelated.map(({ id, inverseRole, contact: other }) => ({ id, role: inverseRole, contact: other })),
      ].sort((a, b) => a.contact.name.localeCompare(b.contact.name)),
    };
  }

  /** Inserts a contact's links, if any. */
  private static async insertLinks(executor: Executor, contactId: number, links: ContactLink[] | undefined) {
    if (links && links.length > 0) {
      await executor
        .insert(schema.contactLink)
        .values(links.map((link) => ({ contactId, name: link.name, url: link.url, type: link.type })));
    }
  }

  /** The household address book, filtered and ordered for the contacts page (and the picker). */
  public static async list(householdId: number, { search, type, sortKey, sortDirection }: ListContactsQueryParams) {
    const columns = schema.contact;
    const filters: Filters = [eq(columns.householdId, householdId)];

    if (search) {
      const term = `%${search}%`;
      filters.push(
        or(
          ilike(columns.name, term),
          ilike(columns.email, term),
          ilike(columns.phone, term),
          ilike(columns.description, term)
        )
      );
    }

    if (type) {
      filters.push(eq(columns.type, type));
    }

    const direction = (expression: Parameters<typeof asc>[0]) =>
      sortDirection === 'desc' ? desc(expression) : asc(expression);

    return db.query.contact.findMany({
      where: and(...filters),
      // The id breaks ties, so rows sharing a sort key don't reshuffle between two identical requests.
      orderBy: ContactsService.orderBy(sortKey, direction).concat(asc(columns.id)),
      with: { links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] } },
    });
  }

  /**
   * `birthday` means "whose is next", not "which date is smaller" — a 1974 birthday is not older news
   * than a 2019 one, it is simply further down the year. Comparing `MM-DD` as text is what makes that
   * exact: no arithmetic, so no wrapping to get wrong and no special case for 29 February.
   */
  private static orderBy(
    sortKey: ListContactsQueryParams['sortKey'],
    direction: (expression: Parameters<typeof asc>[0]) => ReturnType<typeof asc>
  ) {
    const columns = schema.contact;

    if (sortKey !== 'birthday') {
      return [direction(columns[sortKey])];
    }

    const monthDay = sql`to_char(${columns.dateOfBirth}, 'MM-DD')`;

    return [
      // Contacts with no birthday sort last whichever way the rest points — false orders before true.
      sql`${columns.dateOfBirth} is null`,
      // Birthdays already past this year belong after the ones still coming.
      direction(sql`${monthDay} < ${todayMonthDay()}`),
      direction(monthDay),
    ];
  }

  /**
   * Resolves a contact, scoped to its household so ids from elsewhere 404. Public because owners
   * that *link* an existing contact need the same check — and an `executor` so that link can be made
   * in the same transaction as whatever else the request writes.
   */
  public static async readContactRow(householdId: number, contactId: number, executor: Executor = db) {
    const contact = await executor.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
    });

    if (!contact) {
      throw notFound('Contact');
    }

    return contact;
  }

  /** Creates a contact and its links. Accepts an `executor` so an owner can create-and-link atomically. */
  public static async create(householdId: number, data: CreateContact, executor: Executor = db) {
    // Resolved *before* the contact is written, not after. `executor` defaults to `db` rather than a
    // transaction — the standalone create route hands it nothing — so a relation naming an id from
    // another household would otherwise 404 with the new contact already committed and orphaned.
    const relations = await ContactsService.resolveRelations(executor, householdId, data.relations);

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
        dateOfBirth: emptyToNull(data.dateOfBirth),
      })
      .returning();

    if (!created) {
      throw somethingWentWrong();
    }

    await ContactsService.insertLinks(executor, created.id, data.links);

    if (relations.length > 0) {
      await executor
        .insert(schema.contactRelation)
        .values(relations.map((relation) => ({ ...relation, contactId: created.id })));
    }

    return ContactsService.readWithLinks(householdId, created.id, executor);
  }

  /**
   * Checks the far end of every relation named on a create, and settles each one's stored pair of
   * roles — everything about them that can fail, done while failing is still free.
   *
   * Nothing here can breach the pair index: the contact these will hang off doesn't exist yet, so it
   * has no relations to duplicate. Two entries naming the *same* far contact twice would, which is
   * what the seen-set drops.
   */
  private static async resolveRelations(
    executor: Executor,
    householdId: number,
    relations: CreateContactRelation[] | undefined
  ) {
    const seen = new Set<number>();
    const resolved = [];

    for (const relation of relations ?? []) {
      if (seen.has(relation.relatedContactId)) {
        continue;
      }

      seen.add(relation.relatedContactId);
      await ContactsService.readContactRow(householdId, relation.relatedContactId, executor);

      resolved.push({
        relatedContactId: relation.relatedContactId,
        role: relation.role,
        inverseRole: relation.inverseRole ?? INVERSE_ROLE[relation.role],
      });
    }

    return resolved;
  }

  public static async patch(householdId: number, contactId: number, data: PatchContact) {
    // With its links, at the same cost as the plain row — they are half of what a save can change.
    const existing = await ContactsService.readWithLinks(householdId, contactId);

    const set = {
      type: data.type,
      name: data.name,
      description: emptyToNull(data.description),
      email: emptyToNull(data.email),
      phone: emptyToNull(data.phone),
      address: emptyToNull(data.address),
      dateOfBirth: emptyToNull(data.dateOfBirth),
    };

    const changeset = changedColumns(existing, set);

    if (data.links !== undefined && !sameList(existing.links.map(linkKey), data.links.map(linkKey))) {
      changeset.push({ field: 'links' });
    }

    await db.transaction(async (tx) => {
      // Skip the update when only links changed — an all-undefined `set` has nothing to write.
      if (writesAnything(set)) {
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

    return { data: await ContactsService.readWithLinks(householdId, contactId), changeset };
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

  /**
   * Resolves a relation from *either* of the two contacts it joins — the route names one of them, and
   * which end entered the row is an implementation detail the caller never sees.
   */
  private static async readRelationRow(householdId: number, contactId: number, relationId: number) {
    // Scopes by household: the relation's own columns carry none, both its ends being contacts.
    await ContactsService.readContactRow(householdId, contactId);

    const [relation] = await db
      .select()
      .from(schema.contactRelation)
      .where(
        and(
          eq(schema.contactRelation.id, relationId),
          or(eq(schema.contactRelation.contactId, contactId), eq(schema.contactRelation.relatedContactId, contactId))
        )
      );

    if (!relation) {
      throw notFound('Relation');
    }

    return relation;
  }

  public static async addRelation(householdId: number, contactId: number, data: CreateContactRelation) {
    // The DB says this too, but a check-constraint breach escapes as a 500 rather than a message.
    if (data.relatedContactId === contactId) {
      throw new HTTPException(400, { message: 'A contact cannot be related to itself' });
    }

    const [contact, relatedContact] = await Promise.all([
      ContactsService.readContactRow(householdId, contactId),
      ContactsService.readContactRow(householdId, data.relatedContactId),
    ]);

    try {
      await db.insert(schema.contactRelation).values({
        contactId: contact.id,
        relatedContactId: relatedContact.id,
        role: data.role,
        inverseRole: data.inverseRole ?? INVERSE_ROLE[data.role],
      });
    } catch (error) {
      // The pair index is keyed on least/greatest, so this fires for the mirrored entry too — which is
      // the point: the same two people are already related, whichever end is asking.
      if (isUniqueViolation(error)) {
        throw alreadyExists(relatedContact.name, `related to ${contact.name}`);
      }

      throw error;
    }

    return ContactsService.read(householdId, contactId);
  }

  public static async patchRelation(
    householdId: number,
    contactId: number,
    relationId: number,
    data: PatchContactRelation
  ) {
    const relation = await ContactsService.readRelationRow(householdId, contactId, relationId);

    // The payload always speaks in `contactId`'s frame. Approached from the far end of the row that
    // frame is reversed, so what the caller calls `role` is the column called `inverseRole`.
    const set =
      relation.contactId === contactId
        ? { role: data.role, inverseRole: data.inverseRole }
        : { role: data.inverseRole, inverseRole: data.role };

    if (writesAnything(set)) {
      await db.update(schema.contactRelation).set(set).where(eq(schema.contactRelation.id, relationId));
    }

    return ContactsService.read(householdId, contactId);
  }

  public static async removeRelation(householdId: number, contactId: number, relationId: number) {
    await ContactsService.readRelationRow(householdId, contactId, relationId);

    await db.delete(schema.contactRelation).where(eq(schema.contactRelation.id, relationId));

    return ContactsService.read(householdId, contactId);
  }
}
