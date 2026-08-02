import { ChevronsUpDownIcon } from 'lucide-react';
import { type ComponentProps } from 'react';

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
 * of at the far edge (and `truncate` on the label can never fire). Wearing `selectTriggerClassName`
 * also brings real truncation and placeholder styling for free.
 *
 * Use `ComboboxTrigger` instead when the trigger is an *action* — a small "Add ingredient" button
 * that happens to open a picker.
 */
function ComboboxFieldTrigger({ children, className, ...props }: ComponentProps<typeof PopoverTrigger>) {
  return (
    <PopoverTrigger
      className={cn(selectTriggerClassName, 'w-full', className)}
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

/**
 * A persistent action row (e.g. "Create new…"), styled like an item but rendered as a plain button
 * outside the Command item registry — so it highlights only on hover/focus and is never auto-selected
 * the way cmdk keeps a search result highlighted.
 */
function ComboboxAction({ className, ...props }: ComponentProps<'button'>) {
  return (
    <div className="p-1">
      <button
        className={cn(
          "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className
        )}
        data-slot="combobox-action"
        type="button"
        {...props}
      />
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
  ComboboxSeparator,
  ComboboxTrigger,
};
