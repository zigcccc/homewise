import z from 'zod';

/** Sex values a child profile can carry. Nullable at the DB level (unset until filled in). */
export const childSex = z.enum(['male', 'female']);
export type ChildSex = z.infer<typeof childSex>;

export const createChildProfileModel = z.object({
  memberId: z.coerce.number<number>().int().positive(),
});
export type CreateChildProfile = z.infer<typeof createChildProfileModel>;

/**
 * General-tab edits, sent as multipart because of the picture (mirrors `users.app.ts` `/me`).
 * Empty strings clear a value. The picture resolves photo → avatar → clear: a `File` on `image`
 * uploads a personal photo; an `avatar` file uploads-or-reuses a shared avatar blob (its filename is
 * the dedup key); `image: ''` clears it.
 *
 * The avatar's filename doubles as its storage path segment (`avatars/<name>`), so it's constrained
 * to a safe `<slug>.<ext>` — no slashes or dots that could escape the folder or overwrite another blob.
 */
export const patchChildProfileModel = z.object({
  dateOfBirth: z.iso.date({ error: 'Use a valid date' }).or(z.literal('')).optional(),
  sex: childSex.or(z.literal('')).optional(),
  image: z.union([z.file(), z.string()]).optional(),
  avatar: z
    .file()
    .refine((file) => /^[a-z0-9-]+\.[a-z0-9]+$/.test(file.name), { error: 'Invalid avatar' })
    .optional(),
});
export type PatchChildProfile = z.infer<typeof patchChildProfileModel>;

export const childProfilePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
