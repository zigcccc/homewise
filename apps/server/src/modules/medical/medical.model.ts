import { createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, optionalText } from '#lib/models';

/** Empty string clears the value. Stored on the medical record itself. */
export const patchMedicalInfoModel = createUpdateSchema(schema.medicalInfo)
  .omit({ ...dbOwnedColumns, childProfileId: true, petProfileId: true })
  .extend({ medicalIdNumber: optionalText(64, 'Medical ID number') });
export type PatchMedicalInfo = z.infer<typeof patchMedicalInfoModel>;

export const medicalInfoPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const medicalInfoContactPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  contactId: z.coerce.number<number>().int().positive(),
});
