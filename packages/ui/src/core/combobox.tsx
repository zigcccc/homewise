import { ChevronsUpDownIcon, LoaderCircleIcon } from 'lucide-react';
import { type ComponentProps, type KeyboardEvent } from 'react';
import { useInView } from 'react-intersection-observer';

import { cn } from '../lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { selectTriggerClassName } from './select';

/**
 * A searchable select — a Popover housing a Command list, surfaced under its own `Combobox*` API.
 * Semantically distinct from `Command`: reach for `Combobox` when the popup is a form control for
 * picking a value, and `Command` when it's a command palette / menu of actions. (Radix ships no
 * combobox primitive, so — like shadcn's Radix combobox — this composes Popover + Command.)
 */
function Combobox({ ...props }: ComponentProps<typeof Popover>) {
  return <Popover data-slot="combobox" {...props} />;
}

function ComboboxTrigger({ ...props }: ComponentProps<typeof PopoverTrigger>) {
  return <PopoverTrigger data-slot="combobox-trigger" {...props} />;
}

/**
 * The trigger for a combobox used as a **form field** — full width, label left, chevron right, i.e.
 * indistinguishable from a closed `Select`.
 *
 * Deliberately not a `Button`: `Button` wraps all its children in one flex span for the loading
 * overlay, so `justify-between` sees a single item and the chevron ends up next to the label instead
 * of at the far edge (and `truncate` on the label can never fire).
 *
 * `selectTriggerClassName` brings the box, border, focus ring, sizing and `aria-invalid` state with
 * it. Its truncation and placeholder rules are **not** free, though — they are keyed off
 * `*:data-[slot=select-value]` and `data-placeholder`, which Radix sets on a `Select` and nobody
 * sets on a `PopoverTrigger`. Render the value child as `<span data-slot="select-value">` to pick up
 * the line clamp, and put `data-placeholder` on the trigger yourself while nothing is chosen.
 *
 * `data-size` is the third of those: the `h-9`/`h-8` rules key off it, so without it this box has no
 * height of its own and lands ~2px taller than the `Select` beside it. `SelectTrigger` sets it from
 * the same `size` prop, so this mirrors it rather than hard-coding a height.
 *
 * Use `ComboboxTrigger` instead when the trigger is an *action* — a small "Add ingredient" button
 * that happens to open a picker.
 */
function ComboboxFieldTrigger({
  children,
  className,
  size = 'default',
  ...props
}: ComponentProps<typeof PopoverTrigger> & { size?: 'sm' | 'default' }) {
  return (
    <PopoverTrigger
      className={cn(selectTriggerClassName, 'w-full', className)}
      data-size={size}
      data-slot="combobox-field-trigger"
      {...props}
    >
      {children}
      <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
    </PopoverTrigger>
  );
}

/**
 * The popup body. Defaults to the trigger's width (typical for a form field); pass `className` to
 * override. `shouldFilter={false}` hands filtering back to the caller (e.g. to keep a persistent
 * "create" action visible regardless of the search term).
 */
function ComboboxContent({
  align = 'start',
  children,
  className,
  shouldFilter,
  ...props
}: ComponentProps<typeof PopoverContent> & { shouldFilter?: boolean }) {
  return (
    <PopoverContent
      align={align}
      className={cn('w-(--radix-popover-trigger-width) p-0', className)}
      data-slot="combobox-content"
      {...props}
    >
      <Command shouldFilter={shouldFilter}>{children}</Command>
    </PopoverContent>
  );
}

/** An item's look for a button that is not a cmdk item — `ComboboxAction` and `ComboboxLoadMore`. */
const comboboxRowClassName =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * cmdk's root handler takes **every** Enter to select the highlighted item, so a focused button
 * inside the list would fire that row instead of itself. Kept from reaching it; the browser still
 * activates the button natively.
 */
const keepKeyFromCommand = (event: KeyboardEvent<HTMLButtonElement>) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.stopPropagation();
  }
};

/**
 * A persistent action row (e.g. "Create new…"), styled like an item but rendered as a plain button
 * outside the Command item registry — so it highlights only on hover/focus and is never auto-selected
 * the way cmdk keeps a search result highlighted.
 */
function ComboboxAction({ className, onKeyDown, ...props }: ComponentProps<'button'>) {
  return (
    <div className="p-1">
      <button
        className={cn(comboboxRowClassName, className)}
        data-slot="combobox-action"
        onKeyDown={(event) => {
          onKeyDown?.(event);
          keepKeyFromCommand(event);
        }}
        type="button"
        {...props}
      />
    </div>
  );
}

/** A row-height loading line — the first page of a search, or the page being appended below one. */
function ComboboxLoading({ className, label = 'Loading…' }: { className?: string; label?: string }) {
  return (
    <p
      className={cn('flex items-center justify-center gap-2 px-3 py-4 text-muted-foreground text-sm', className)}
      data-slot="combobox-loading"
      role="status"
    >
      <LoaderCircleIcon className="size-4 animate-spin" />
      {label}
    </p>
  );
}

/** The centred muted line for "nothing here yet" and "nothing matches" alike. */
function ComboboxMessage({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('px-3 py-4 text-center text-muted-foreground text-sm', className)}
      data-slot="combobox-message"
      {...props}
    />
  );
}

/**
 * Asks for the next page as it scrolls into view. The button is the keyboard path — nobody can arrow
 * onto a sentinel. No `root`: overflow clipping means the viewport already reports it correctly.
 */
function ComboboxLoadMore({
  className,
  hasMore,
  isLoading,
  label = 'Load more',
  onLoadMore,
}: {
  className?: string;
  hasMore: boolean;
  isLoading: boolean;
  label?: string;
  onLoadMore: () => void;
}) {
  const { ref } = useInView({
    // A page ahead of the scroll, so the next one has usually landed before the list runs out.
    rootMargin: '120px',
    skip: !hasMore || isLoading,
    onChange: (inView) => {
      if (inView) {
        onLoadMore();
      }
    },
  });

  if (!hasMore) {
    return null;
  }

  return (
    <div className="p-1" ref={ref}>
      {/* Enabled while loading on purpose: disabling it would drop focus out of the list mid-scroll. */}
      <button
        aria-busy={isLoading}
        className={cn(comboboxRowClassName, 'justify-center text-muted-foreground', className)}
        data-slot="combobox-load-more"
        onClick={onLoadMore}
        onKeyDown={keepKeyFromCommand}
        type="button"
      >
        {isLoading ? <LoaderCircleIcon className="animate-spin" /> : null}
        {isLoading ? 'Loading…' : label}
      </button>
    </div>
  );
}

// The inner parts are the Command primitives, re-surfaced under the Combobox name.
const ComboboxInput = CommandInput;
const ComboboxList = CommandList;
const ComboboxEmpty = CommandEmpty;
const ComboboxGroup = CommandGroup;
const ComboboxItem = CommandItem;
const ComboboxSeparator = CommandSeparator;

export {
  Combobox,
  ComboboxAction,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxFieldTrigger,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxLoading,
  ComboboxLoadMore,
  ComboboxMessage,
  ComboboxSeparator,
  ComboboxTrigger,
};
