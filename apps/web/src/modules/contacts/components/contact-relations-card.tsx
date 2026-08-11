import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { type ContactRelationRole } from '@homewise/server/contacts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { parseResponse } from '@/api/client';
import { ConfirmDeleteDialog, inlineTriggerClassName, serverMessage } from '@/modules/shared';

import {
  $patchContactRelation,
  $removeContactRelation,
  type ContactDetail,
  type ContactRelation,
  invalidateContacts,
  listContactsQueryOptions,
} from '../contacts.queries';
import { contactRelationRoleLabels, showsPersonalDetails } from '../helpers';
import { contactTypeLabels } from '../helpers/labels';
import { AddContactCombobox } from './add-contact-combobox';
import { AddRelationDialog } from './add-relation-dialog';

/**
 * Who this contact is related to, and what they are to each other.
 *
 * Every row here is one stored relation seen from *this* contact's side — the same row on the other
 * contact's page reads the other way round, which is why the role select writes back through the
 * route that names this contact rather than the relation's own id alone.
 */
export function ContactRelationsCard({ contact }: { contact: ContactDetail }) {
  const [picking, setPicking] = useState<{ id: number; name: string } | undefined>(undefined);

  // The whole address book, so the picker can offer anyone; already-related contacts show disabled.
  const { data: allContacts = [] } = useQuery(listContactsQueryOptions());

  const relatable = allContacts.filter(
    (candidate) => candidate.id !== contact.id && showsPersonalDetails(candidate.type)
  );
  const relatedIds = new Set(contact.relations.map((relation) => relation.contact.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relations</CardTitle>
        <CardDescription>How {contact.name} is related to the other people you keep track of.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {contact.relations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No relations yet. Record who this is a partner, parent or sibling of.
          </p>
        ) : (
          /* Named: the card's heading doesn't reach the list itself, and a bare list of people is
             indistinguishable from the sidebar's or a toast's to anything reading roles. */
          <ul aria-label="Relations" className="space-y-2">
            {contact.relations.map((relation) => (
              <RelationRow contact={contact} key={relation.id} relation={relation} />
            ))}
          </ul>
        )}

        <AddContactCombobox
          contacts={relatable}
          label="Add relation"
          linkedIds={relatedIds}
          onCreate={() => toast.info('Add the person as a contact first, then relate them here.')}
          onLink={async (relatedContactId) => {
            const related = relatable.find((candidate) => candidate.id === relatedContactId);

            if (related) {
              setPicking({ id: related.id, name: related.name });
            }
          }}
          typeLabels={contactTypeLabels}
        />
      </CardContent>

      {picking && (
        <AddRelationDialog
          contactId={contact.id}
          contactName={contact.name}
          onOpenChange={(next) => !next && setPicking(undefined)}
          open
          relatedContact={picking}
        />
      )}
    </Card>
  );
}

function RelationRow({ contact, relation }: { contact: ContactDetail; relation: ContactRelation }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(false);

  const { mutateAsync: patchRelation } = useMutation({
    mutationFn: async (role: ContactRelationRole) =>
      parseResponse(
        $patchContactRelation({
          param: { id: contact.id.toString(), relationId: relation.id.toString() },
          json: { role },
        })
      ),
  });

  const { mutateAsync: removeRelation } = useMutation({
    mutationFn: async () =>
      parseResponse(
        $removeContactRelation({ param: { id: contact.id.toString(), relationId: relation.id.toString() } })
      ),
  });

  // A live control with no submit and no field to hang a message on: it commits on change and toasts
  // on failure, like the ingredient category cell and the meal-plan member popover.
  const handleRoleChange = async (role: ContactRelationRole) => {
    try {
      await patchRelation(role);
      invalidateContacts(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Could not update the relation.'));
    }
  };

  const handleRemove = async () => {
    try {
      await removeRelation();
      invalidateContacts(queryClient);
      toast.success(`${relation.contact.name} is no longer related to ${contact.name}.`);
    } catch (error) {
      toast.error(serverMessage(error, 'Could not remove the relation.'));
      throw error; // Keep the confirm dialog open so the user can retry.
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      {/* Just the name and the role: the card's description already says whose relations these are,
          and repeating "is {contact.name}'s" on every row spent the width that made them wrap. */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          className="truncate font-medium underline-offset-4 hover:underline"
          params={{ contactId: relation.contact.id.toString() }}
          to="/family/contacts/$contactId"
        >
          {relation.contact.name}
        </Link>
        <span className="shrink-0 text-muted-foreground">—</span>
        <Select onValueChange={(value) => void handleRoleChange(value as ContactRelationRole)} value={relation.role}>
          {/* `w-auto` because the shared class is a *cell* treatment and starts `w-full` — left as
              it comes, the select takes the row to itself and the sentence wraps around it. */}
          <SelectTrigger
            aria-label={`${relation.contact.name}'s relation`}
            className={cn(inlineTriggerClassName, 'w-auto shrink-0')}
          >
            <span>{contactRelationRoleLabels[relation.role]}</span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(contactRelationRoleLabels).map(([option, label]) => (
              <SelectItem key={option} value={option}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        aria-label={`Remove ${relation.contact.name}`}
        className="shrink-0"
        onClick={() => setRemoving(true)}
        size="icon"
        variant="ghost"
      >
        <XIcon />
      </Button>

      {/* Confirmed, because one row is the whole fact: it is the same relation on the other
          contact's page, and removing it here takes it off theirs too. Nothing on this side of the
          screen would show that happening. */}
      <ConfirmDeleteDialog
        confirmLabel="Remove relation"
        description={
          <>
            {relation.contact.name} will no longer be {contact.name}'s{' '}
            {contactRelationRoleLabels[relation.role].toLowerCase()}. This removes it from {relation.contact.name}'s
            page as well — a relation is one record shared by both contacts.
          </>
        }
        onConfirm={handleRemove}
        onOpenChange={setRemoving}
        open={removing}
        title={`Remove ${relation.contact.name}?`}
      />
    </li>
  );
}
