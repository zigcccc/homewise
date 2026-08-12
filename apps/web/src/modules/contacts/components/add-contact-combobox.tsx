import { PlusIcon } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

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

import { type HouseholdContact } from '../contacts.queries';

/** Hoisted so the default doesn't hand the component a new Set on every render. */
const EMPTY_LINKED_IDS: ReadonlySet<number> = new Set();

/**
 * A searchable popover over the household's existing contacts. Selecting one hands it back; the
 * "Create new contact" item opens the create dialog instead. Contacts already linked where this is
 * used (`linkedIds`) stay in the list but are disabled and marked "Already added", so the list never
 * looks empty just because everything is already attached.
 *
 * It opens from an **action** by default — "Add contact", for attaching another one to a set. Where
 * the picker is a form field holding a single value instead, pass a `ComboboxFieldTrigger` as
 * `trigger`: the two are different controls, and a field that looks like a button reads as an action
 * nobody has taken yet.
 */
export function AddContactCombobox({
  contacts,
  label = 'Add contact',
  linkedIds = EMPTY_LINKED_IDS,
  onCreate,
  onLink,
  trigger,
  typeLabels,
}: {
  contacts: HouseholdContact[];
  /**
   * What the action button says. It names what picking someone here *does*, which is not always
   * "add a contact" — on a contact's own page it records a relation between two that already exist,
   * and "Add contact" there reads as though it attaches a contact to a contact.
   */
  label?: string;
  /** Omit where only one contact is ever chosen — nothing can already be attached. */
  linkedIds?: ReadonlySet<number>;
  onCreate: () => void;
  onLink: (contactId: number) => Promise<void>;
  /** Replaces the default action button entirely. Must be a combobox trigger. */
  trigger?: ReactNode;
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
      {trigger ?? (
        <ComboboxTrigger asChild>
          <Button size="sm" variant="outline">
            <PlusIcon />
            {label}
          </Button>
        </ComboboxTrigger>
      )}
      {/* A field trigger is full width, so its popup hangs off the same edge the field starts at. */}
      <ComboboxContent align={trigger ? 'start' : 'end'} className={trigger ? undefined : 'w-72'} shouldFilter={false}>
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
