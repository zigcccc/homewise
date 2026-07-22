import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { HouseholdsService } from '../households/households.service';
import { ImagesService } from '../images/images.service';
import { type CreatePetProfile, type PatchPetProfile } from './models';

/** The `pet` join: a household member, shaped like the households module returns them. */
const memberWith = {
  columns: { id: true, name: true, nickname: true, role: true, userId: true },
  with: { user: { columns: { id: true, email: true, name: true } } },
} as const;

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

type ProfileRow = {
  member: Parameters<typeof HouseholdsService.toMemberResponse>[0];
};

export class PetProfilesService {
  /** Flattens the joined member into the same shape the households module returns everywhere else. */
  private static toResponse<P extends ProfileRow>(profile: P, ownerId: string) {
    const { member, ...rest } = profile;
    return {
      ...rest,
      pet: HouseholdsService.toMemberResponse(member, ownerId),
    };
  }

  public static async list(householdId: number, ownerId: string) {
    const profiles = await db.query.petProfile.findMany({
      where: (fields, { eq }) => eq(fields.householdId, householdId),
      orderBy: (fields, { asc }) => [asc(fields.createdAt)],
      with: { member: memberWith },
    });

    return profiles.map((profile) => PetProfilesService.toResponse(profile, ownerId));
  }

  /** Existence + household-scoping check, without the joins the full detail response needs. */
  private static async readProfileRow(householdId: number, profileId: number) {
    const profile = await db.query.petProfile.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, profileId)),
    });

    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    return profile;
  }

  public static async read(householdId: number, profileId: number, ownerId: string) {
    const profile = await db.query.petProfile.findFirst({
      where: (fields, { and, eq }) => and(eq(fields.householdId, householdId), eq(fields.id, profileId)),
      with: { member: memberWith },
    });

    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    return PetProfilesService.toResponse(profile, ownerId);
  }

  public static async create(householdId: number, data: CreatePetProfile, ownerId: string) {
    // Throws 404 when the member belongs to a different household.
    const member = await HouseholdsService.readHouseholdMember(householdId, data.memberId);

    if (member.role !== 'pet') {
      throw new HTTPException(400, { message: 'Only members with the "pet" role can have a profile.' });
    }

    // `onConflictDoNothing` lets the (householdId, memberId) unique constraint be the single source of
    // truth — a pre-read plus insert would race two concurrent creates into a raw DB error instead of a 409.
    const [profile] = await db
      .insert(schema.petProfile)
      .values({ householdId, memberId: member.id })
      .onConflictDoNothing({ target: [schema.petProfile.householdId, schema.petProfile.memberId] })
      .returning();

    if (!profile) {
      throw new HTTPException(409, { message: 'This pet already has a profile.' });
    }

    return PetProfilesService.read(householdId, profile.id, ownerId);
  }

  public static async patch(householdId: number, profileId: number, data: PatchPetProfile, ownerId: string) {
    const existing = await PetProfilesService.readProfileRow(householdId, profileId);

    const patch: Partial<typeof schema.petProfile.$inferInsert> = {
      dateOfBirth: emptyToNull(data.dateOfBirth),
      joinedFamilyOn: emptyToNull(data.joinedFamilyOn),
      type: data.type === '' ? null : data.type,
      breed: emptyToNull(data.breed),
      sex: data.sex === '' ? null : data.sex,
    };

    // Picture resolves photo → avatar → clear. Both become blob URLs, so the stored value is
    // portable across clients (no dependency on any app's bundled assets).
    if (data.image instanceof File) {
      const { url } = await ImagesService.put(data.image, `pet-profiles/${profileId}/${data.image.name}`, {
        size: 256,
      });
      patch.profilePicture = url;
      await PetProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    } else if (data.avatar instanceof File) {
      patch.profilePicture = await PetProfilesService.resolveAvatar(data.avatar);
      await PetProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    } else if (data.image === '') {
      patch.profilePicture = null;
      await PetProfilesService.deleteBlobIfUploaded(existing.profilePicture);
    }

    await db
      .update(schema.petProfile)
      .set(patch)
      .where(and(eq(schema.petProfile.householdId, householdId), eq(schema.petProfile.id, profileId)));

    return PetProfilesService.read(householdId, profileId, ownerId);
  }

  /**
   * Deduplicates a client-provided avatar in storage, keyed by its filename. Avatars share a flat
   * `avatars/<filename>` path (not namespaced per pet): if that blob already exists we reuse its
   * URL and drop the uploaded bytes; otherwise we store them once. Shared avatar blobs are never
   * deleted. The filename is validated as a safe path segment by `patchPetProfileModel`.
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
   * Drops a previous picture from blob storage — but only per-pet uploads (`pet-profiles/…`),
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

    if (pathname.startsWith('/pet-profiles/')) {
      await ImagesService.delete(profilePicture);
    }
  }

  public static async delete(householdId: number, profileId: number) {
    const [deleted] = await db
      .delete(schema.petProfile)
      .where(and(eq(schema.petProfile.householdId, householdId), eq(schema.petProfile.id, profileId)))
      .returning();

    if (!deleted) {
      throw new HTTPException(404, { message: 'Profile not found' });
    }

    await PetProfilesService.deleteBlobIfUploaded(deleted.profilePicture);

    return deleted;
  }
}
