import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { type ContactRelationRole, contactRelationRole, createContactRelationModel } from '@homewise/server/contacts';
import { INVERSE_ROLE } from '@homewise/server/contacts/constants';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import { $addContactRelation, invalidateContacts } from '../contacts.queries';
import { contactRelationRoleLabels } from '../helpers';

type RelationFormValues = z.infer<typeof createContactRelationModel>;

/**
 * Names the relation between two contacts, in both directions at once.
 *
 * The reverse is a *suggestion*, prefilled from `INVERSE_ROLE` and left editable, because the obvious
 * opposite is not always the right one: the opposite of "husband" is "wife", but the opposite of
 * "mother" is a son or a daughter and nothing here knows which. Asking for both is what lets one
 * stored row read correctly from either contact's page.
 */
export function AddRelationDialog({
  contactId,
  contactName,
  onOpenChange,
  open,
  relatedContact,
}: {
  contactId: number;
  contactName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  relatedContact: { id: number; name: string };
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add relation</DialogTitle>
          <DialogDescription>
            How {relatedContact.name} and {contactName} are related.
          </DialogDescription>
        </DialogHeader>
        <RelationForm
          contactId={contactId}
          contactName={contactName}
          onDone={() => onOpenChange(false)}
          relatedContact={relatedContact}
        />
      </DialogContent>
    </Dialog>
  );
}

function RelationForm({
  contactId,
  contactName,
  onDone,
  relatedContact,
}: {
  contactId: number;
  contactName: string;
  onDone: () => void;
  relatedContact: { id: number; name: string };
}) {
  const queryClient = useQueryClient();

  const form = useForm<RelationFormValues>({
    resolver: zodResolver(createContactRelationModel),
    defaultValues: { relatedContactId: relatedContact.id, role: 'friend', inverseRole: INVERSE_ROLE.friend },
  });

  const role = form.watch('role');

  /**
   * Retracking the suggestion as the first select moves — but only while the second still holds the
   * suggestion, so a reverse the user has actually chosen is never overwritten.
   */
  const handleRoleChange = (next: ContactRelationRole) => {
    if (form.getValues('inverseRole') === INVERSE_ROLE[role]) {
      form.setValue('inverseRole', INVERSE_ROLE[next]);
    }

    form.setValue('role', next);
  };

  const submit: SubmitHandler<RelationFormValues> = async (values) => {
    try {
      await parseResponse($addContactRelation({ param: { id: contactId.toString() }, json: values }));
      invalidateContacts(queryClient);
      toast.success('Relation added.');
      onDone();
    } catch (error) {
      toast.error(serverMessage(error, 'Could not add the relation.'));
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {relatedContact.name} is {contactName}'s…
              </FormLabel>
              <Select onValueChange={handleRoleChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <span>{contactRelationRoleLabels[field.value]}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {contactRelationRole.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {contactRelationRoleLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="inverseRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                …which makes {contactName} {relatedContact.name}'s
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? INVERSE_ROLE[role]}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <span>{contactRelationRoleLabels[field.value ?? INVERSE_ROLE[role]]}</span>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {contactRelationRole.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {contactRelationRoleLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            Add relation
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
