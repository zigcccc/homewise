import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { createContactModel } from '@homewise/server/contacts';
import { clearableDate } from '@homewise/server/models';
import {
  Button,
  ComboboxFieldTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  AddContactCombobox,
  ContactFormDialog,
  contactTypeLabels,
  invalidateContacts,
  listContactsQueryOptions,
} from '@/modules/contacts';
import { DateField, serverMessage, todayISODay } from '@/modules/shared';
import { invalidateStorageLocations } from '@/modules/storage-locations';

import {
  $lendStorageItem,
  applyStorageItemUpdate,
  invalidateStorageItems,
  type LendStorageItemPayload,
  type StorageItem,
} from '../storage-items.queries';

/**
 * The borrower is two mutually exclusive fields rather than one, mirroring the endpoint: an existing
 * contact is an id, a new one is a whole contact the loan creates. Both live in the form rather than
 * in local state, so picking one is a field with a message under it like any other.
 */
const loanFormModel = z.object({
  borrowedOn: clearableDate,
  contactId: z.number().int().positive().optional(),
  dueOn: clearableDate.optional(),
  newContact: createContactModel.optional(),
});

type LoanFormValues = z.infer<typeof loanFormModel>;

/** The loan as the endpoint takes it, or `null` when nobody has been named yet. */
function toPayload(values: LoanFormValues, dates: { borrowedOn: string; dueOn: string }) {
  if (values.newContact !== undefined) {
    return { contact: values.newContact, ...dates } satisfies LendStorageItemPayload;
  }

  if (values.contactId !== undefined) {
    return { contactId: values.contactId, ...dates } satisfies LendStorageItemPayload;
  }

  return null;
}

/**
 * Lends an item to a household contact — one the address book already has, or one created with the
 * loan. The pair goes in a single request, so a contact minted for a loan can't outlive a loan that
 * then failed to land.
 */
export function LendItemDialog({
  item,
  onOpenChange,
  open,
}: {
  item: StorageItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lend "{item.name}"</DialogTitle>
          <DialogDescription>Record who has it and when it's due back, so you know who to ask.</DialogDescription>
        </DialogHeader>
        {/* A dialog that loads its own data must catch its own suspense. `useSuspenseQuery` inside the
            form would otherwise reach the *route's* boundary and replace the whole page behind this
            dialog with a spinner while it fetches. */}
        <Suspense fallback={<Spinner className="min-h-48" />}>
          <LendForm item={item} onDone={() => onOpenChange(false)} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function LendForm({ item, onDone }: { item: StorageItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: contacts } = useSuspenseQuery(listContactsQueryOptions());
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanFormModel),
    defaultValues: { borrowedOn: todayISODay(), contactId: undefined, dueOn: '', newContact: undefined },
  });

  const { mutateAsync: lend } = useMutation({
    mutationFn: async (json: LendStorageItemPayload) =>
      parseResponse($lendStorageItem({ param: { id: item.id.toString() }, json })),
    onSuccess: (updated) => {
      applyStorageItemUpdate(queryClient, updated);
      invalidateStorageItems(queryClient);
      // The location's on-loan count just moved.
      invalidateStorageLocations(queryClient);
    },
  });

  const submit: SubmitHandler<LoanFormValues> = async (values) => {
    const json = toPayload(values, {
      borrowedOn: values.borrowedOn || todayISODay(),
      dueOn: values.dueOn ?? '',
    });

    if (!json) {
      form.setError('contactId', { message: 'Choose who has it' });

      return;
    }

    try {
      const updated = await lend(json);
      toast.success(`"${item.name}" is out with ${updated.loan?.name ?? 'someone'}.`);
      invalidateContacts(queryClient);
      onDone();
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  const contactId = form.watch('contactId');
  const newContact = form.watch('newContact');
  const borrowerName = newContact?.name ?? contacts.find((contact) => contact.id === contactId)?.name;

  return (
    <>
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <FormField
            control={form.control}
            name="contactId"
            render={() => (
              <FormItem>
                <FormLabel>Who has it</FormLabel>
                <AddContactCombobox
                  contacts={contacts}
                  onCreate={() => setCreateOpen(true)}
                  onLink={async (id) => {
                    form.setValue('contactId', id, { shouldDirty: true });
                    form.setValue('newContact', undefined, { shouldDirty: true });
                    form.clearErrors('contactId');
                  }}
                  // `FormControl` sits inside the trigger, not around the picker: it's a Slot that
                  // clones its child with the id `FormLabel` points at, and a wrapper `div` would
                  // take that id and leave the label attached to nothing.
                  trigger={
                    <FormControl>
                      <ComboboxFieldTrigger>
                        {borrowerName ? (
                          <span className="truncate">{borrowerName}</span>
                        ) : (
                          <span className="text-muted-foreground">Choose someone</span>
                        )}
                      </ComboboxFieldTrigger>
                    </FormControl>
                  }
                  typeLabels={contactTypeLabels}
                />
                <FormDescription>Anyone in the household's address book, or someone new.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* `items-start`, or the shorter column stretches and centres its rows against the taller
              one — which reads as two fields that don't line up. */}
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="borrowedOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lent on</FormLabel>
                  <FormControl>
                    <DateField onChange={field.onChange} value={field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due back</FormLabel>
                  <FormControl>
                    <DateField allowFuture onChange={field.onChange} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Optional — most loans are open-ended.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <DialogFooter>
            <Button loading={form.formState.isSubmitting} type="submit">
              Lend it out
            </Button>
          </DialogFooter>
        </form>
      </Form>

      <ContactFormDialog
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          // Held on the form rather than created here: the loan endpoint mints the contact in the
          // same transaction, so an abandoned dialog leaves no address-book entry behind.
          form.setValue('newContact', values, { shouldDirty: true });
          form.setValue('contactId', undefined, { shouldDirty: true });
          form.clearErrors('contactId');
          setCreateOpen(false);
        }}
        open={createOpen}
        typeLabels={contactTypeLabels}
      />
    </>
  );
}
