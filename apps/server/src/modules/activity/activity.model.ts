import z from 'zod';

import { searchQueryParam } from '#lib/models';
import { householdEventEntity } from '#modules/realtime/realtime.model';

/**
 * What a feed URL narrows by. The entity union is the realtime one rather than a second copy — both
 * are the same DB enum, and a logged row *is* an emitted event that carried a label.
 */
export const activityFiltersModel = z.object({
  actorId: z.string().trim().min(1).optional().catch(undefined),
  entity: householdEventEntity.optional().catch(undefined),
  search: searchQueryParam,
});
export type ActivityFilters = z.infer<typeof activityFiltersModel>;

/**
 * The filters plus the page to fetch. `cursor` is the id of the last row already shown: the table is
 * append-only and `id` is serial, so "older than that one" is the entire condition — no composite
 * keyset, and no rows skipped or repeated when someone writes mid-scroll the way an offset would.
 */
export const listActivityQueryParamsModel = activityFiltersModel.extend({
  cursor: z.coerce.number<number>().int().positive().optional().catch(undefined),
  limit: z.coerce.number<number>().int().min(1).max(100).default(20).catch(20),
});
export type ListActivityQueryParams = z.infer<typeof listActivityQueryParamsModel>;
