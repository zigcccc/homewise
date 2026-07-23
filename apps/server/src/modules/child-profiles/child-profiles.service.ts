import { and, count, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { HouseholdsService } from '../households/households.service';
import { ImagesService } from '../images/images.service';
import { MedicalService, medicalInfoWith } from '../medical/medical.service';
import { type CreateChildProfile, type PatchChildProfile } from './models';

/** The `child` join: a household member, shaped like the households module returns them. */
const memberWith = {
  columns: { id: true, name: true, nickname: true, role: true, userId: true },
  with: { user: { columns: { id: true, email: true, name: true } } },
} as const;

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

type ProfileRow = {
  member: Parameters<typeof HouseholdsService.toMemberResponse>[0];
  dictionary: { id: number } | null;
};

export class ChildProfilesService {
  /**
   * Flattens the joined member into the same shape the households module returns everywhere else, and
   * surfaces the linked dictionary as `{ id, entryCount }`.
   */
  private static toResponse<P extends ProfileRow>(profile: P, ownerId: string, entryCount: number) {
    const { member, dictionary, ...rest } = profile;
    return {
      ...rest,
      child: HouseholdsService.toMemberResponse(member, ownerId),
      dictionary: dictionary ? { id: dictionary.id, entryCount } : null,
    };
  }

  public static async list(householdId: number, ownerId: string) {
    const profiles = await db.query.childProfile.findMany({
      where: (fields, { eq }) => eq(fields.householdId, householdId),
      orderBy: (fields, { asc }) => [asc(fields.createdAt)],
      with: { member: memberWith, dictionary: { columns: { id: true } } },
    });

    // Scoped to the dictionaries we just read — without this the group-by scans every entry row in
    // the table, across all households.
    const dictionaryIds = profiles.map((profile) => profile.dictionary?.id).filter((id) => id !== undefined);

    const entryCounts = dictionaryIds.length
      ? await db
          .select({ dictionaryId: schema.childDictionaryEntry.dictionaryId, count: count() })
          .from(schema.childDictionaryEntry)
          .where(inArray(schema.childDictionaryEntry.dictionaryId, dictionaryIds))
          .groupBy(schema.childDictionaryEntry.dictionaryId)
      : [];

    const countByDictionary = new Map(entryCounts.map(({ dictionaryId, count }) => [dictionaryId, count]));

    return profiles.map((profile) =>
      ChildProfilesService.toResponse(profile, ownerId, countByDictionary.get(profile.dictionary?.id ?? -1) ?? 0)
    );
  }

  /** Existence + household-scoping check, without the joins the full detail response needs. */
  private static async readProfileRow(householdId: number, profileId: number) {
    const profile = await db.query.childProfile.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, profileId)),
    });

    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    return profile;
  }

  public static async read(householdId: number, profileId: number, ownerId: string) {
    const profile = await db.query.childProfile.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, profileId)),
      with: { member: memberWith, dictionary: { columns: { id: true } }, medicalInfo: medicalInfoWith },
    });

    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    const entryCount = profile.dictionary
      ? ((
          await db
            .select({ count: count() })
            .from(schema.childDictionaryEntry)
            .where(eq(schema.childDictionaryEntry.dictionaryId, profile.dictionary.id))
        )[0]?.count ?? 0)
      : 0;

    // The medical record is eager-created with the profile (and backfilled), so it's always present.
    const { medicalInfo, ...rest } = profile;
    if (!medicalInfo) {
      throw new HTTPException(500, { message: 'Medical info missing for profile' });
    }

    return {
      ...ChildProfilesService.toResponse(rest, ownerId, entryCount),
      medicalInfo: MedicalService.toMedicalInfoResponse(medicalInfo),
    };
  }

  public static async create(householdId: number, data: CreateChildProfile, ownerId: string) {
    // Throws 404 when the member belongs to a different household.
    const member = await HouseholdsService.readHouseholdMember(householdId, data.memberId);

    if (member.role !== 'child') {
      throw new HTTPException(400, { message: 'Only members with the "child" role can have a profile.' });
    }

    const created = await db.transaction(async (tx) => {
      // `onConflictDoNothing` lets the (householdId, memberId) unique constraint be the single source of
      // truth — a pre-read plus insert would race two concurrent creates into a raw DB error instead of a 409.
      const [profile] = await tx
        .insert(schema.childProfile)
        .values({ householdId, memberId: member.id })
        .onConflictDoNothing({ target: [schema.childProfile.householdId, schema.childProfile.memberId] })
        .returning();

      if (!profile) {
        throw new HTTPException(409, { message: 'This child already has a profile.' });
      }

      // The dictionary is the profile's first sub-feature — created alongside it, one per profile.
      await tx.insert(schema.childDictionary).values({ householdId, profileId: profile.id });
      // The medical record is created with the profile too, one per profile.
      await tx.insert(schema.medicalInfo).values({ householdId, childProfileId: profile.id });

      return profile;
    });

    return ChildProfilesService.read(householdId, created.id, ownerId);
  }

  public static async patch(householdId: number, profileId: number, data: PatchChildProfile, ownerId: string) {
    const existing = await ChildProfilesService.readProfileRow(householdId, profileId);

    const patch: Partial<typeof schema.childProfile.$inferInsert> = {
      dateOfBirth: emptyToNull(data.dateOfBirth),
      sex: data.sex === '' ? null : data.sex,
      nationalId: emptyToNull(data.nationalId),
      taxId: emptyToNull(data.taxId),
    };

    // Picture resolves photo → avatar → clear (all become portable blob URLs). ImagesService uploads
    // the replacement up front and hands back a commit/rollback pair that retires the old blob only
    // after the DB write lands — see `commitManagedImage` below.
    const picture = await ImagesService.resolveManagedImage(
      { image: data.image, avatar: data.avatar },
      existing.profilePicture,
      { ownedPrefix: `child-profiles/${profileId}`, size: 256 }
    );
    if (picture.changed) {
      patch.profilePicture = picture.value;
    }

    const persisted = await ImagesService.commitManagedImage(picture, async () => {
      const [row] = await db
        .update(schema.childProfile)
        .set(patch)
        .where(and(eq(schema.childProfile.householdId, householdId), eq(schema.childProfile.id, profileId)))
        .returning({ id: schema.childProfile.id });
      return Boolean(row);
    });

    // Zero rows means the profile was deleted concurrently — the replacement blob was already rolled back.
    if (!persisted) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    return ChildProfilesService.read(householdId, profileId, ownerId);
  }

  public static async delete(householdId: number, profileId: number) {
    const [deleted] = await db
      .delete(schema.childProfile)
      .where(and(eq(schema.childProfile.householdId, householdId), eq(schema.childProfile.id, profileId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    // The row is already gone — cleanup is best-effort and guarded to this child's own uploads.
    await ImagesService.cleanupOwnedImage(deleted.profilePicture, `child-profiles/${profileId}`);

    return deleted;
  }
}
