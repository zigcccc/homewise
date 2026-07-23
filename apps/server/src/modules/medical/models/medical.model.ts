import z from 'zod';

/** Empty string clears the value. Stored on the medical record itself. */
export const patchMedicalInfoModel = z.object({
  medicalIdNumber: z
    .string()
    .trim()
    .max(64, { error: 'Medical ID number must contain at most 64 characters' })
    .or(z.literal(''))
    .optional(),
});
export type PatchMedicalInfo = z.infer<typeof patchMedicalInfoModel>;

export const medicalInfoPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const medicalInfoContactPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  contactId: z.coerce.number<number>().int().positive(),
});
