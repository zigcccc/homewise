import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import { $createContact, $patchContact, getContactQueryOptions, invalidateContacts } from '../contacts.queries';
import { applyRelationChanges, contactTypeLabels, toRelationDrafts } from '../helpers';
import { ContactFormDialog, type ContactFormValues } from './contact-form-dialog';

/**
 * The address book's own create/edit dialog — `ContactFormDialog` with the contacts endpoints behind
 * it. The generic one stays caller-driven because the owners that mint a contact (a medical record, a
 * loan) each post somewhere else; this is where a contact is written *as* a contact, alongside
 * `CreateRelatedContactDialog`, which writes the far end of a relation and nothing else.
 */
export function ContactDialog({
  contactId,
  onOpenChange,
  open,
}: {
  /** Omitted to create. */
  contactId?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();

  // The list rows carry no relations — only the detail response does — so editing loads the record
  // rather than seeding the form from whatever the caller happened to have. Getting this wrong is
  // not a blank section: the save would read it as "every relation removed".
  const { data: contact } = useQuery({ ...getContactQueryOptions(contactId ?? 0), enabled: contactId !== undefined });

  const savedRelations = contact ? toRelationDrafts(contact.relations) : [];

  const submit = async (values: ContactFormValues) => {
    const { relations = [], ...fields } = values;

    try {
      if (contact) {
        await parseResponse($patchContact({ param: { id: contact.id.toString() }, json: fields }));
        await applyRelationChanges(contact.id, savedRelations, relations);
      } else {
        await parseResponse(
          $createContact({
            json: {
              ...fields,
              // The wire model knows nothing of `relationId`/`relatedContactName`; the reverse wording
              // is the server's default from `INVERSE_ROLE`.
              relations: relations.map(({ relatedContactId, role }) => ({ relatedContactId, role })),
            },
          })
        );
      }

      toast.success(contact ? 'Contact updated.' : 'Contact added.');
    } catch (error) {
      toast.error(serverMessage(error, contact ? 'Could not update contact.' : 'Could not add contact.'));
      throw error; // Keep the dialog open so the user can retry.
    } finally {
      // In `finally`, because an edit is several requests and a failure half way through leaves the
      // server ahead of the cache. `savedRelations` is read from that cache, so skipping this would
      // have the retry re-issue the removals that already succeeded — and a removal of an
      // already-removed relation 404s, which is a dialog nobody can get out of.
      invalidateContacts(queryClient);
    }
  };

  return (
    <ContactFormDialog
      contact={contact ? { ...contact, relations: savedRelations } : undefined}
      // The address book is where people are kept, so a new one starts as family rather than a doctor.
      defaultType="family"
      excludeId={contactId}
      isLoading={contactId !== undefined && !contact}
      offersRelations
      onOpenChange={onOpenChange}
      onSubmit={submit}
      open={open}
      typeLabels={contactTypeLabels}
    />
  );
}
