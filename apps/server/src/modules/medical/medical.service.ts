import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { ContactsService } from '../contacts/contacts.service';
import { type CreateContact } from '../contacts/models';
import { type PatchMedicalInfo } from './models';

/**
 * Query fragment for loading a profile's medical info with its linked contacts. Spread into a profile's
 * `read` query (`with: { medicalInfo: medicalInfoWith }`) or used standalone here. Pair with
 * `toMedicalInfoResponse` to flatten the join rows into a `contacts` array.
 */
export const medicalInfoWith = {
  columns: { id: true, medicalIdNumber: true },
  with: { links: { columns: {}, with: { contact: { with: { links: true } } } } },
} as const;

/** The row shape `medicalInfoWith` produces. */
type MedicalInfoRow = {
  id: number;
  medicalIdNumber: string | null;
  links: { contact: typeof schema.contact.$inferSelect & { links: (typeof schema.contactLink.$inferSelect)[] } }[];
};

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

/** Medical records + the medical-info↔contact link. A record's lifecycle belongs to its profile. */
export class MedicalService {
  /** Flattens the join rows into a sorted `contacts` array. */
  public static toMedicalInfoResponse(info: MedicalInfoRow) {
    const contacts = info.links.map((link) => link.contact).sort((a, b) => a.name.localeCompare(b.name));

    return { id: info.id, medicalIdNumber: info.medicalIdNumber, contacts };
  }

  /** Existence + household-scoping check. */
  private static async readMedicalInfoRow(householdId: number, medicalInfoId: number) {
    const info = await db.query.medicalInfo.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, medicalInfoId)),
    });

    if (!info) {
      throw new HTTPException(404, { message: 'Medical info not found' });
    }

    return info;
  }

  /** Re-reads the record with its contacts, so mutations return the same shape as the profile nests. */
  private static async read(householdId: number, medicalInfoId: number) {
    const info = await db.query.medicalInfo.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, medicalInfoId)),
      ...medicalInfoWith,
    });

    if (!info) {
      throw new HTTPException(404, { message: 'Medical info not found' });
    }

    return MedicalService.toMedicalInfoResponse(info);
  }

  public static async patchInfo(householdId: number, medicalInfoId: number, data: PatchMedicalInfo) {
    const [updated] = await db
      .update(schema.medicalInfo)
      .set({ medicalIdNumber: emptyToNull(data.medicalIdNumber) })
      .where(and(eq(schema.medicalInfo.householdId, householdId), eq(schema.medicalInfo.id, medicalInfoId)))
      .returning({ id: schema.medicalInfo.id });

    if (!updated) {
      throw new HTTPException(404, { message: 'Medical info not found' });
    }

    return MedicalService.read(householdId, medicalInfoId);
  }

  /** Creates a contact and links it to the medical info in one transaction. */
  public static async addContact(householdId: number, medicalInfoId: number, data: CreateContact) {
    await MedicalService.readMedicalInfoRow(householdId, medicalInfoId);

    return db.transaction(async (tx) => {
      const contact = await ContactsService.create(householdId, data, tx);
      await tx.insert(schema.medicalInfoContact).values({ medicalInfoId, contactId: contact.id });

      return contact;
    });
  }

  /** Links an already-existing household contact to the medical info. Idempotent on the unique pair. */
  public static async linkContact(householdId: number, medicalInfoId: number, contactId: number) {
    await MedicalService.readMedicalInfoRow(householdId, medicalInfoId);

    // Scopes the contact to the household so a foreign id can't be linked in. Loads it with its links so
    // the mutation returns the same joined shape as profile reads and the other contact mutations.
    const contact = await db.query.contact.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, contactId)),
      with: { links: { orderBy: (fields, { asc }) => [asc(fields.createdAt)] } },
    });

    if (!contact) {
      throw new HTTPException(404, { message: 'Contact not found' });
    }

    await db
      .insert(schema.medicalInfoContact)
      .values({ medicalInfoId, contactId })
      .onConflictDoNothing({ target: [schema.medicalInfoContact.medicalInfoId, schema.medicalInfoContact.contactId] });

    return contact;
  }

  /**
   * Unlinks a contact from the medical info. The contact itself is left intact (it may be reused by
   * other owners); a household contacts listing to reach unlinked contacts comes later.
   */
  public static async unlinkContact(householdId: number, medicalInfoId: number, contactId: number) {
    await MedicalService.readMedicalInfoRow(householdId, medicalInfoId);

    const [deletedLink] = await db
      .delete(schema.medicalInfoContact)
      .where(
        and(
          eq(schema.medicalInfoContact.medicalInfoId, medicalInfoId),
          eq(schema.medicalInfoContact.contactId, contactId)
        )
      )
      .returning();

    if (!deletedLink) {
      throw new HTTPException(404, { message: 'Contact not linked to this medical info' });
    }

    return deletedLink;
  }
}
