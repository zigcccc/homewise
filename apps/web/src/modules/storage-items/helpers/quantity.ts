import z from 'zod';

import { storageItemQuantity } from '@homewise/server/storage-items';

/**
 * The quantity as an inline cell speaks it: a string in and a string out, because `InlineTextField`
 * edits text while the column holds a number.
 *
 * Only "is this a number at all" is decided here — everything about which numbers are allowed comes
 * back from `storageItemQuantity`, so the cell and the endpoint can't drift apart on the bounds.
 */
export const quantityText = z
  .string()
  .trim()
  .refine((value) => /^\d+$/.test(value), { error: 'Quantity must be a whole number' })
  .superRefine((value, ctx) => {
    const parsed = storageItemQuantity.safeParse(Number(value));

    for (const issue of parsed.error?.issues ?? []) {
      ctx.addIssue({ code: 'custom', message: issue.message });
    }
  });
