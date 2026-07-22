import z from 'zod';

/** The kind of animal a pet profile describes. Nullable at the DB level (unset until filled in). */
export const petType = z.enum(['dog', 'cat', 'turtle', 'hamster', 'horse', 'parrot', 'other']);
export type PetType = z.infer<typeof petType>;

/** Sex values a pet profile can carry. Nullable at the DB level (unset until filled in). */
export const petSex = z.enum(['male', 'female']);
export type PetSex = z.infer<typeof petSex>;

export const createPetProfileModel = z.object({
  memberId: z.coerce.number<number>().int().positive(),
});
export type CreatePetProfile = z.infer<typeof createPetProfileModel>;

/**
 * General-tab edits, sent as multipart because of the picture (mirrors `users.app.ts` `/me`).
 * Empty strings clear a value. The picture resolves photo → avatar → clear: a `File` on `image`
 * uploads a personal photo; an `avatar` file uploads-or-reuses a shared avatar blob (its filename is
 * the dedup key); `image: ''` clears it.
 *
 * The avatar's filename doubles as its storage path segment (`avatars/<name>`), so it's constrained
 * to a safe `<slug>.<ext>` — no slashes or dots that could escape the folder or overwrite another blob.
 */
export const patchPetProfileModel = z.object({
  dateOfBirth: z.iso.date({ error: 'Use a valid date' }).or(z.literal('')).optional(),
  joinedFamilyOn: z.iso.date({ error: 'Use a valid date' }).or(z.literal('')).optional(),
  type: petType.or(z.literal('')).optional(),
  breed: z.string().max(120, { error: 'Breed is too long' }).optional(),
  sex: petSex.or(z.literal('')).optional(),
  image: z.union([z.file(), z.string()]).optional(),
  avatar: z
    .file()
    .mime(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'], { error: 'Avatar must be an image' })
    .max(1024 * 1024, { error: 'Avatar must be under 1MB' })
    .refine((file) => /^[a-z0-9-]+\.[a-z0-9]+$/.test(file.name), { error: 'Invalid avatar' })
    .optional(),
});
export type PatchPetProfile = z.infer<typeof patchPetProfileModel>;

export const petProfilePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
