import { and, count, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { HouseholdsService } from '../households/households.service';
import { ImagesService } from '../images/images.service';
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
      with: { member: memberWith, dictionary: { columns: { id: true } } },
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

    return ChildProfilesService.toResponse(profile, ownerId, entryCount);
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

      return profile;
    });

    return ChildProfilesService.read(householdId, created.id, ownerId);
  }

  public static async patch(householdId: number, profileId: number, data: PatchChildProfile, ownerId: string) {
    const existing = await ChildProfilesService.readProfileRow(householdId, profileId);

    const patch: Partial<typeof schema.childProfile.$inferInsert> = {
      dateOfBirth: emptyToNull(data.dateOfBirth),
      sex: data.sex === '' ? null : data.sex,
    };

    // Picture resolves photo → avatar → clear. Both become blob URLs, so the stored value is
    // portable across clients (no dependency on any app's bundled assets).
    if (data.image instanceof File) {
      const { url } = await ImagesService.put(data.image, `child-profiles/${profileId}/${data.image.name}`, {
        size: 256,
      });
      patch.profilePicture = url;
      await ChildProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    } else if (data.avatar instanceof File) {
      patch.profilePicture = await ChildProfilesService.resolveAvatar(data.avatar);
      await ChildProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    } else if (data.image === '') {
      patch.profilePicture = null;
      await ChildProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    }

    await db
      .update(schema.childProfile)
      .set(patch)
      .where(and(eq(schema.childProfile.householdId, householdId), eq(schema.childProfile.id, profileId)));

    return ChildProfilesService.read(householdId, profileId, ownerId);
  }

  /**
   * Deduplicates a client-provided avatar in storage, keyed by its filename. Avatars share a flat
   * `avatars/<filename>` path (not namespaced per child): if that blob already exists we reuse its
   * URL and drop the uploaded bytes; otherwise we store them once. Shared avatar blobs are never
   * deleted. The filename is validated as a safe path segment by `patchChildProfileModel`.
   */
  private static async resolveAvatar(file: File) {
    const pathname = `avatars/${file.name}`;
    const existing = await ImagesService.find(pathname);
    if (existing) {
      return existing;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    return ImagesService.putStable(pathname, bytes, file.type || 'image/svg+xml');
  }

  /**
   * Drops a previous picture from blob storage — but only per-child uploads (`child-profiles/…`),
   * never the shared avatar blobs, which other profiles may point at.
   */
  private static async deleteBlobIfUploaded(profilePicture: string | null) {
    if (!profilePicture) {
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(profilePicture).pathname;
    } catch {
      return;
    }

    if (pathname.startsWith('/child-profiles/')) {
      await ImagesService.delete(profilePicture);
    }
  }

  public static async delete(householdId: number, profileId: number) {
    const [deleted] = await db
      .delete(schema.childProfile)
      .where(and(eq(schema.childProfile.householdId, householdId), eq(schema.childProfile.id, profileId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    await ChildProfilesService.deleteBlobIfUploaded(deleted.profilePicture);

    return deleted;
  }
}
