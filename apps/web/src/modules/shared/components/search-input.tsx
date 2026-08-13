import { SearchIcon } from 'lucide-react';
import { useDebounceCallback } from 'usehooks-ts';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { useEchoedState } from '../hooks';

/** Long enough to finish a word in, short enough that a pause feels like a result. */
const DEBOUNCE_MS = 400;

/**
 * The search box every list view shares: debounced, and reporting `undefined` rather than `''` so a
 * cleared box drops the param instead of filtering on nothing.
 *
 * `label` is the accessible name. A placeholder is not one: it disappears the moment anyone types.
 */
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
  const [typed, setTyped] = useEchoedState(value ?? '');

  const publish = useDebounceCallback((next: string) => onChange(next || undefined), DEBOUNCE_MS);

  return (
    <InputGroup className={cn('w-full sm:w-auto sm:flex-1', className)}>
      <InputGroupInput
        aria-label={label}
        onChange={(event) => {
          setTyped(event.target.value);
          publish(event.target.value);
        }}
        placeholder={placeholder}
        value={typed}
      />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
    </InputGroup>
  );
}
