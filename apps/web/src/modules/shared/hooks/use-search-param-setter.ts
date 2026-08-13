import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

/**
 * Sets one of the route's search params, keeping the rest.
 *
 * `replace` for a change not worth a history entry — a debounced search term, where pushing would
 * make Back walk the word back a letter at a time.
 */
export function useSearchParamSetter<Search extends Record<string, unknown>>(searchParams: Search) {
  const navigate = useNavigate();

  return useCallback(
    <Key extends keyof Search>(key: Key, value: Search[Key], { replace = false }: { replace?: boolean } = {}) =>
      navigate({ replace, search: { ...searchParams, [key]: value }, to: '.' }),
    [navigate, searchParams]
  );
}

/** For passing the setter down to a child component, without restating its signature there. */
export type SearchParamSetter<Search extends Record<string, unknown>> = ReturnType<typeof useSearchParamSetter<Search>>;
