import z from 'zod';

import { pagedQueryParams, searchQueryParam } from '#lib/models';
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

/**
 * Freezes the feed at a row the reader has already seen, so a line written mid-scroll can't shift
 * the page boundary. This is the one list that grows at the head as it is read.
 *
 * Out of `activityFiltersModel` because it is per-scroll: those double as the route's search params.
 */
const feedAnchor = z.coerce.number<number>().int().positive().optional().catch(undefined);

export const listActivityQueryParamsModel = activityFiltersModel
  .extend({ maxId: feedAnchor })
  .extend(pagedQueryParams(PAGE_SIZE).shape);
export type ListActivityQueryParams = z.infer<typeof listActivityQueryParamsModel>;
