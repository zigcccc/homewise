import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import z from 'zod';

import { type SearchParamSetter, useSearchParamSetter } from './use-search-param-setter';

const searchParamsModel = z.object({
  search: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
});
type SearchParams = z.infer<typeof searchParamsModel>;

/** The same list, paginated — what every table route's schema looks like. */
const pagedParamsModel = searchParamsModel.extend({
  page: z.number().default(1).catch(1),
  pageSize: z.number().default(25).catch(25),
});

/**
 * A real router over a memory history, rather than a stubbed `useNavigate`.
 *
 * What the hook is *for* is when it reads the other params — from the router as it navigates, not
 * from the render that built the setter — and a stub would answer that question for us.
 */
async function renderInRouter<Shape extends z.ZodRawShape>(validateSearch: z.ZodObject<Shape>) {
  let taken: SearchParamSetter<typeof listRoute> | undefined;

  const rootRoute = createRootRoute();
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/list',
    validateSearch,
    component: function ListRoute() {
      taken = useSearchParamSetter(listRoute);
      return null;
    },
  });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/list'] }),
    routeTree: rootRoute.addChildren([listRoute]),
  });

  render(<RouterProvider router={router as never} />);
  await waitFor(() => expect(taken).toBeDefined());

  const set = async (...args: Parameters<NonNullable<typeof taken>>) => {
    await act(async () => {
      await taken?.(...args);
    });
  };

  return {
    params: () => router.state.location.search as SearchParams & Partial<z.infer<typeof pagedParamsModel>>,
    set,
    setter: () => taken,
  };
}

describe('useSearchParamSetter', () => {
  it('should keep the other params when it sets one', async () => {
    // GIVEN: a list already narrowed by a filter
    const { params, set } = await renderInRouter(searchParamsModel);
    await set('type', 'family');

    // WHEN: a search term is set as well
    await set('search', 'ana');

    // THEN: both should be in the URL
    expect(params()).toEqual({ search: 'ana', type: 'family' });
  });

  it('should merge into the params as they are when it lands, not as they were when it was built', async () => {
    // GIVEN: a setter taken while the list had no filter on it — what a debounced search box closes
    // over the moment somebody starts typing
    const { params, set, setter } = await renderInRouter(searchParamsModel);
    const setWhileUnfiltered = setter();

    // WHEN: a filter is applied first, and only then does the term land
    await set('type', 'family');
    await act(async () => {
      await setWhileUnfiltered?.('search', 'ana');
    });

    // THEN: the filter should survive. Spreading the params the setter was built with writes them
    // back wholesale, quietly undoing a filter the user set half a second ago
    expect(params()).toEqual({ search: 'ana', type: 'family' });
  });

  it('should return to the first page when it narrows a paginated list', async () => {
    // GIVEN: a reader partway through a paginated list
    const { params, set } = await renderInRouter(pagedParamsModel);
    await set('page', 9);

    // WHEN: they search within it
    await set('search', 'ana');

    // THEN: they should be back on page one. Page 9 of a result that may now have two renders an
    // empty table, and the fix belongs here rather than at every filter control in the app
    expect(params()).toMatchObject({ page: 1, search: 'ana' });
  });

  it('should keep the page when it is the page being set', async () => {
    // GIVEN: a paginated list
    const { params, set } = await renderInRouter(pagedParamsModel);

    // WHEN: the reader turns to another page
    await set('page', 4);

    // THEN: the reset must not undo the very navigation that triggered it
    expect(params()).toMatchObject({ page: 4 });
  });

  it('should leave a list with no pages alone', async () => {
    // GIVEN: a route whose schema has no `page` at all
    const { params, set } = await renderInRouter(searchParamsModel);

    // WHEN: a filter is set
    await set('type', 'family');

    // THEN: no `page` should appear in the URL — a key the route can't validate is a key it would
    // strip on the next navigation anyway
    expect(params()).toEqual({ type: 'family' });
  });
});
