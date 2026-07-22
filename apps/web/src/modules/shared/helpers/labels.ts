/**
 * Human-readable labels for values shared across profile domains. Keyed by the raw enum literals so
 * the same map serves both `childSex` and `petSex` (identical `'male' | 'female'` values).
 */
export const sexLabels: Record<'male' | 'female', string> = {
  male: 'Male',
  female: 'Female',
};
