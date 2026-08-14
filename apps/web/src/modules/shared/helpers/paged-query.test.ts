import { describe, expect, it } from 'vitest';

import { nextPageParam, shouldOfferCreate } from './paged-query';

const page = (overrides: Partial<Parameters<typeof nextPageParam>[0]> = {}) => ({
  page: 1,
  pageSize: 25,
  total: 100,
  ...overrides,
});

describe('the options page param', () => {
  it('should ask for the next page while rows remain', () => {
    expect(nextPageParam(page())).toStrictEqual({ page: 2 });
  });

  it('should stop on the page that exactly exhausts the list', () => {
    // GIVEN: one page holding every row there is — the off-by-one that would ask for an empty page 2
    expect(nextPageParam(page({ pageSize: 25, total: 25 }))).toBeUndefined();
  });

  it('should stop on an empty list', () => {
    expect(nextPageParam(page({ total: 0 }))).toBeUndefined();
  });

  it('should terminate when the server clamps an offset past the end', () => {
    // GIVEN: page 9 was asked for, and `readPagedList` answered with the last real page instead
    const clamped = page({ page: 2, pageSize: 25, total: 40 });

    // WHEN: the next page is worked out
    // THEN: undefined — reading the *requested* page here would ask for 10, then 11, forever
    expect(nextPageParam(clamped)).toBeUndefined();
  });
});

describe('offering to create what was typed', () => {
  const items = [{ name: 'Lidl' }, { name: 'Lidl Centre' }];
  const settled = { isFetching: false, items, pendingSearch: 'spar', search: 'spar' };

  it('should offer a term that matches nothing loaded', () => {
    expect(shouldOfferCreate(settled)).toBe(true);
  });

  it('should not offer an empty box', () => {
    expect(shouldOfferCreate({ ...settled, pendingSearch: '', search: '   ' })).toBe(false);
  });

  it('should not offer a name that already exists, whatever its case', () => {
    expect(shouldOfferCreate({ ...settled, pendingSearch: 'LIDL', search: 'LIDL' })).toBe(false);
  });

  it('should still offer a term that is only a prefix of an existing name', () => {
    // GIVEN: "Lidl Centre" is loaded but "Lidl Sever" is not a row — a substring match is not an exact one
    expect(shouldOfferCreate({ ...settled, pendingSearch: 'Lidl Sever', search: 'Lidl Sever' })).toBe(true);
  });

  it('should stay hidden until the typed term reaches the query', () => {
    // GIVEN: the debounce has not fired, so `items` is still the unsearched first page
    expect(shouldOfferCreate({ isFetching: false, items, pendingSearch: '', search: 'Spar' })).toBe(false);
  });

  it('should stay hidden while the results for the typed term are in flight', () => {
    // GIVEN: the term has reached the query, but the rows on screen are the previous search's
    const stale = [{ name: 'Spar' }, { name: 'Mercator' }];

    expect(shouldOfferCreate({ isFetching: true, items: stale, pendingSearch: 'Lidl', search: 'Lidl' })).toBe(false);
  });

  it('should ignore whitespace on either side of the term', () => {
    expect(shouldOfferCreate({ ...settled, pendingSearch: 'Lidl ', search: '  Lidl' })).toBe(false);
  });
});
