import { type ComponentProps, type ReactNode } from 'react';

import {
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxLoading,
  ComboboxLoadMore,
  ComboboxMessage,
} from '@homewise/ui/core';

/** A subset of `useAsyncOptions`, so `items`/`reset` can't ride a spread onto a DOM node. */
export type AsyncOptionsState = {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  search: string;
  setSearch: (value: string) => void;
};

/** The popup half of a server-searched picker. `action` is separate so it sits below the sentinel. */
export function AsyncComboboxContent({
  action,
  children,
  emptyMessage,
  isEmpty,
  options,
  placeholder,
  ...props
}: ComponentProps<typeof ComboboxContent> & {
  action?: ReactNode;
  emptyMessage: ReactNode;
  /** Whether `children` rendered no rows, so this can say so instead of showing a blank box. */
  isEmpty: boolean;
  options: AsyncOptionsState;
  placeholder: string;
}) {
  return (
    <ComboboxContent shouldFilter={false} {...props}>
      {/* Named, not just placeheld — a placeholder is not an accessible name. */}
      <ComboboxInput
        aria-label={placeholder}
        onValueChange={options.setSearch}
        placeholder={placeholder}
        value={options.search}
      />
      <ComboboxList>
        {children}
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
