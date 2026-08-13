import { type UseNavigateResult } from '@tanstack/react-router';
import { useCallback } from 'react';

/** Any file route, narrowed to the two things this needs: its search schema, and its own navigate. */
type RouteWithSearch = {
  types: { fullSearchSchema: Record<string, unknown> };
  useNavigate: () => UseNavigateResult<string>;
};

/**
 * Sets one of the route's search params, keeping the rest.
 *
 * Takes the `Route` so the params stay the route's own: the keys and values come from its
 * `validateSearch`, and the navigation is bound to it. Reaching for the router-wide `useNavigate()`
 * instead would accept any key and any value.
 *
 * The other params are read at navigation time rather than from the render that built the setter, so
 * a call that lands late — a debounce firing after a filter click — merges into the params as they
 * are now instead of reinstating the ones it was created with.
 *
 * `replace` for a change not worth a history entry: a search term pushed per keystroke makes Back
 * walk the word backwards a letter at a time instead of leaving the page.
 *
 * **Changing anything other than the page returns to page 1.** Narrowing a list while reading page 9
 * of it otherwise asks for page 9 of a result that may only have two, and the fix belongs here rather
 * than at each of the ~40 filter controls that would each have to remember it. Routes with no `page`
 * param are untouched — the key is only reset where the schema already has one.
 */
export function useSearchParamSetter<Route extends RouteWithSearch>(route: Route) {
  const navigate = route.useNavigate();

  return useCallback(
    <Key extends keyof Route['types']['fullSearchSchema']>(
      key: Key,
      value: Route['types']['fullSearchSchema'][Key],
      { replace = false }: { replace?: boolean } = {}
    ) =>
      navigate({
        replace,
        search: (current) => ({
          ...current,
          ...(key !== 'page' && 'page' in current && { page: 1 }),
          [key]: value,
        }),
        to: '.',
      }),
    [navigate]
  );
}

/** For passing the setter down to a child component, without restating its signature there. */
export type SearchParamSetter<Route extends RouteWithSearch> = ReturnType<typeof useSearchParamSetter<Route>>;
