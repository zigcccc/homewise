import z from 'zod';

/**
 * A free-text optional field: trims, caps the length with a message that names the field, and accepts
 * an empty string as "cleared" — blanking an input sends `''`, which the service normalizes to NULL
 * via `emptyToNull`. Omitting the key entirely leaves the stored value untouched.
 */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must contain at most ${max} characters` })
    .or(z.literal(''))
    .optional();

/**
 * A money amount as the API speaks it: major units, positive, at most two decimals.
 *
 * The decimals are checked with `toFixed` rather than `.multipleOf(0.01)` — 0.01 has no exact binary
 * representation, so the modulo check rejects perfectly ordinary values like 8.29.
 *
 * And refused rather than rounded: the column behind this is `numeric(12,2)`, which would quietly turn
 * 1.005 into 1.01 and never mention it. The ceiling is that column's, too.
 */
export const moneyAmount = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .positive({ error: `${label} must be more than 0` })
    .max(9_999_999_999.99, { error: `${label} is too large` })
    .refine((value) => Number(value.toFixed(2)) === value, {
      error: `${label} can have at most 2 decimal places`,
    });
