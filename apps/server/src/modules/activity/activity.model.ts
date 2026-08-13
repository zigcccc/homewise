import z from 'zod';

import { cursorQueryParams, searchQueryParam } from '#lib/models';
import { householdEventEntity } from '#modules/realtime/realtime.model';

/** The entity union is the realtime one, not a copy: a logged row *is* an event that carried a label. */
export const activityFiltersModel = z.object({
  actorId: z.string().trim().min(1).optional().catch(undefined),
  entity: householdEventEntity.optional().catch(undefined),
  search: searchQueryParam,
});
export type ActivityFilters = z.infer<typeof activityFiltersModel>;

/** How many lines a feed page holds when the caller doesn't say. */
const PAGE_SIZE = 20;

export const listActivityQueryParamsModel = activityFiltersModel.extend(cursorQueryParams(PAGE_SIZE).shape);
export type ListActivityQueryParams = z.infer<typeof listActivityQueryParamsModel>;
