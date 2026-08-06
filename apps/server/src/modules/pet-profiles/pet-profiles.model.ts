import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { avatarFile, clearableDate, dbOwnedColumns, profileImage } from '#lib/models';

/** The kind of animal a pet profile describes. Nullable at the DB level (unset until filled in). */
export const petType = createSelectSchema(schema.petTypeEnum);
export type PetType = z.infer<typeof petType>;

/** Sex values a pet profile can carry. Nullable at the DB level (unset until filled in). */
export const petSex = createSelectSchema(schema.petSexEnum);
export type PetSex = z.infer<typeof petSex>;

export const createPetProfileModel = createInsertSchema(schema.petProfile).pick({ memberId: true });
export type CreatePetProfile = z.infer<typeof createPetProfileModel>;

/**
 * General-tab edits, sent as multipart because of the picture (mirrors `users.app.ts` `/me`).
 * Empty strings clear a value. The picture resolves photo → avatar → clear: a `File` on `image`
 * uploads a personal photo; an `avatar` file uploads-or-reuses a shared avatar blob (its filename is
 * the dedup key); `image: ''` clears it.
 */
export const patchPetProfileModel = createUpdateSchema(schema.petProfile)
  .omit({ ...dbOwnedColumns, memberId: true, profilePicture: true })
  // Every field is `''`-to-clear rather than the column's NULL, so the whole set is restated.
  .extend({
    avatar: avatarFile,
    breed: z.string().max(120, { error: 'Breed is too long' }).optional(),
    dateOfBirth: clearableDate.optional(),
    image: profileImage,
    joinedFamilyOn: clearableDate.optional(),
    sex: petSex.or(z.literal('')).optional(),
    type: petType.or(z.literal('')).optional(),
  });
export type PatchPetProfile = z.infer<typeof patchPetProfileModel>;

export const petProfilePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
