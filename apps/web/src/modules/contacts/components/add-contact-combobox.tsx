import { type InferResponseType } from 'hono';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { type ContactType } from '@homewise/server/contacts';
import {
  Button,
  Combobox,
  ComboboxAction,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from '@homewise/ui/core';

import { type client } from '@/api/client';

/** A household contact as the list endpoint returns it. */
export type HouseholdContact = InferResponseType<typeof client.contacts.$get, 200>[number];

/**
 * The "Add contact" entry point: a searchable popover over the household's existing contacts. Selecting
 * one links it to this medical info; the "Create new contact" item opens the create dialog instead.
 * Contacts already linked here (`linkedIds`) stay in the list but are disabled and marked "Already
 * added", so the list never looks empty just because everything is already attached.
 */
export function AddContactCombobox({
  contacts,
  linkedIds,
  onCreate,
  onLink,
  typeLabels,
}: {
  contacts: HouseholdContact[];
  linkedIds: Set<number>;
  onCreate: () => void;
  onLink: (contactId: number) => Promise<void>;
  typeLabels: Record<ContactType, string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return query
      ? contacts.filter(
          (contact) => contact.name.toLowerCase().includes(query) || (contact.email ?? '').toLowerCase().includes(query)
        )
      : contacts;
  }, [query, contacts]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const handleLink = async (contactId: number) => {
    await onLink(contactId);
    close();
  };

  return (
    <Combobox
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch('');
        }
      }}
      open={open}
    >
      <ComboboxTrigger asChild>
        <Button size="sm" variant="outline">
          <PlusIcon />
          Add contact
        </Button>
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-72" shouldFilter={false}>
        <ComboboxInput onValueChange={setSearch} placeholder="Search contacts…" value={search} />
        <ComboboxList>
          {filtered.length > 0 ? (
            <ComboboxGroup heading="Existing contacts">
              {filtered.map((contact) => {
                const isLinked = linkedIds.has(contact.id);
                return (
                  <ComboboxItem
                    disabled={isLinked}
                    key={contact.id}
                    onSelect={isLinked ? undefined : () => void handleLink(contact.id)}
                    value={String(contact.id)}
                  >
                    <span className="truncate">{contact.name}</span>
                    {isLinked ? (
                      <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                        Already added
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 text-muted-foreground text-xs">{typeLabels[contact.type]}</span>
                    )}
                  </ComboboxItem>
                );
              })}
            </ComboboxGroup>
          ) : (
            <p className="px-3 py-4 text-center text-muted-foreground text-sm">
              {contacts.length === 0 ? 'No contacts yet.' : 'No matching contacts.'}
            </p>
          )}
          <ComboboxSeparator />
          <ComboboxAction
            onClick={() => {
              close();
              onCreate();
            }}
          >
            <PlusIcon />
            Create new contact
          </ComboboxAction>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
