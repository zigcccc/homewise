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
 * The newest row a reader has seen, pinning the feed while they page through it.
 *
 * This is the one list that grows at the *head* while it is being read — every mutation in the
 * household writes a line — and an offset counts from the top, so a row arriving between two pages
 * pushes the boundary down and repeats a line. Anchoring to an id the reader already saw makes the
 * result set they are paging a fixed one. Deliberately an ordinary filter and not a second kind of
 * pagination: it narrows *which* rows, the same as `entity` or `search`, and leaves `page` to say
 * which slice of them.
 *
 * Kept out of `activityFiltersModel` because it is per-scroll, not per-view: the filters double as
 * the web route's search params, and this has no business in a shared URL.
 */
const feedAnchor = z.coerce.number<number>().int().positive().optional().catch(undefined);

export const listActivityQueryParamsModel = activityFiltersModel
  .extend({ maxId: feedAnchor })
  .extend(pagedQueryParams(PAGE_SIZE).shape);
export type ListActivityQueryParams = z.infer<typeof listActivityQueryParamsModel>;
