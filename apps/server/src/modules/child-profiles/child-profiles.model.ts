import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { avatarFile, clearableDate, dbOwnedColumns, profileImage } from '#lib/models';

/** Sex values a child profile can carry. Nullable at the DB level (unset until filled in). */
export const childSex = createSelectSchema(schema.childSexEnum);
export type ChildSex = z.infer<typeof childSex>;

export const createChildProfileModel = createInsertSchema(schema.childProfile).pick({ memberId: true });
export type CreateChildProfile = z.infer<typeof createChildProfileModel>;

/**
 * General-tab edits, sent as multipart because of the picture (mirrors `users.app.ts` `/me`).
 * Empty strings clear a value. The picture resolves photo → avatar → clear: a `File` on `image`
 * uploads a personal photo; an `avatar` file uploads-or-reuses a shared avatar blob (its filename is
 * the dedup key); `image: ''` clears it.
 */
export const patchChildProfileModel = createUpdateSchema(schema.childProfile)
  .omit({ ...dbOwnedColumns, memberId: true, profilePicture: true })
  // Every field is `''`-to-clear rather than the column's NULL, so the whole set is restated.
  .extend({
    avatar: avatarFile,
    dateOfBirth: clearableDate.optional(),
    image: profileImage,
    nationalId: z.string().max(64).optional(),
    sex: childSex.or(z.literal('')).optional(),
    taxId: z.string().max(64).optional(),
  });
export type PatchChildProfile = z.infer<typeof patchChildProfileModel>;

export const childProfilePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
