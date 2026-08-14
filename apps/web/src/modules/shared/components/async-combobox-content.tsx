import { type ComponentProps, type ReactNode } from 'react';

import {
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxLoading,
  ComboboxLoadMore,
  ComboboxMessage,
} from '@homewise/ui/core';

/** A subset of `useAsyncOptions`, so `reset` can't ride a spread onto a DOM node. */
export type AsyncOptionsState<TItem> = {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  items: TItem[];
  pendingSearch: string;
  search: string;
  setSearch: (value: string) => void;
};

/** The popup half of a server-searched picker. `action` is separate so it sits below the sentinel. */
export function AsyncComboboxContent<TItem>({
  action,
  children,
  emptyMessage,
  leading,
  options,
  placeholder,
  ...props
}: Omit<ComponentProps<typeof ComboboxContent>, 'children'> & {
  action?: ReactNode;
  /** Called only when there are results, so an empty group heading never hangs over nothing. */
  children: (items: TItem[]) => ReactNode;
  emptyMessage: ReactNode;
  /** Rows that aren't results — a "None" row — so a search matching nothing still leaves them. */
  leading?: ReactNode;
  options: AsyncOptionsState<TItem>;
  placeholder: string;
}) {
  const isEmpty = options.items.length === 0;

  return (
    // `data-search` is the term the rows below answer, which lags the box by the debounce. E2E waits
    // on it rather than on a sleep, which can't tell a slow request from one that hasn't started.
    <ComboboxContent data-search={options.pendingSearch} shouldFilter={false} {...props}>
      {/* Named, not just placeheld — a placeholder is not an accessible name. */}
      <ComboboxInput
        aria-label={placeholder}
        onValueChange={options.setSearch}
        placeholder={placeholder}
        value={options.search}
      />
      <ComboboxList>
        {leading}
        {!isEmpty && children(options.items)}
        {options.isLoading && <ComboboxLoading />}
        {isEmpty && !options.isLoading && <ComboboxMessage>{emptyMessage}</ComboboxMessage>}
        <ComboboxLoadMore
          hasMore={options.hasNextPage}
          isLoading={options.isFetchingNextPage}
          onLoadMore={options.fetchNextPage}
        />
        {action}
      </ComboboxList>
    </ComboboxContent>
  );
}
