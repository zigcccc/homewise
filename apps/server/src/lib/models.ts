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
