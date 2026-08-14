import { SearchIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useDebounceCallback } from 'usehooks-ts';

import { Form, FormField, InputGroup, InputGroupAddon, InputGroupInput } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { SEARCH_DEBOUNCE_MS } from '../constants/search';

/** The search box every list view shares. `label` is the accessible name; a placeholder is not one. */
export function SearchInput({
  className,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  value: string | undefined;
}) {
  // `values` keeps the box showing what is actually being filtered by when the param moves on its
  // own — a Back button, or a filter cleared elsewhere — while typing stays ahead of the debounce.
  const form = useForm({ values: { search: value ?? '' } });

  const publish = useDebounceCallback((next: string) => onChange(next || undefined), SEARCH_DEBOUNCE_MS);

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="search"
        render={({ field }) => (
          <InputGroup className={cn('w-full sm:w-auto sm:flex-1', className)}>
            <InputGroupInput
              {...field}
              aria-label={label}
              onChange={(event) => {
                field.onChange(event);
                publish(event.target.value);
              }}
              placeholder={placeholder}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        )}
      />
    </Form>
  );
}
