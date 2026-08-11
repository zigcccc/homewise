import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import {
  type ContactLinkType,
  type ContactType,
  contactLinkType,
  contactRelationRole,
  contactType,
  createContactModel,
} from '@homewise/server/contacts';
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
  Input,
  PlaceAutocomplete,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
  Textarea,
} from '@homewise/ui/core';

import { DateField } from '@/modules/shared';

import { type HouseholdContact } from '../contacts.queries';
import { contactLinkTypeLabels, contactRelationRoleLabels, type RelationDraft, showsPersonalDetails } from '../helpers';
import { AddContactCombobox } from './add-contact-combobox';

/**
 * The server's create model, plus what the *form* needs to show a relation and to tell an existing
 * one from a new one.
 *
 * `relationId` and `relatedContactName` are deliberately not on the wire model — a payload has no
 * business carrying the other contact's name, and zod would strip both on the way through the
 * resolver, leaving the save unable to tell which rows it had already stored.
 */
const contactFormModel = createContactModel.extend({
  relations: z
    .array(
      z.object({
        relationId: z.number().optional(),
        relatedContactId: z.number(),
        relatedContactName: z.string(),
        role: contactRelationRole,
      })
    )
    .optional(),
});

export type ContactFormValues = z.infer<typeof contactFormModel>;

/** The subset of a contact the form edits — matches what the profile response nests. */
export type EditableContact = {
  type: ContactType;
  name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  links: { name: string; url: string; type: ContactLinkType }[];
  /** Absent wherever a contact is edited without its relations to hand — a profile's vet. */
  relations?: RelationDraft[];
};

function toDefaults(contact?: EditableContact, defaultType: ContactType = 'medical'): ContactFormValues {
  return {
    type: contact?.type ?? defaultType,
    name: contact?.name ?? '',
    description: contact?.description ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    address: contact?.address ?? '',
    dateOfBirth: contact?.dateOfBirth ?? '',
    links: contact?.links ?? [],
    relations: contact?.relations ?? [],
  };
}

/**
 * Add/edit dialog for a standalone contact. Generic — the caller supplies `onSubmit` (which endpoint
 * runs depends on the owner) and a `typeLabels` map so pet profiles can relabel `medical` as vet.
 *
 * The form body lives in `ContactForm`, mounted inside `DialogContent`. Radix mounts the content only
 * while the dialog is open, so the form seeds its `defaultValues` from the current `contact` on every
 * open and tears down on close — no reset effect needed.
 */
export function ContactFormDialog({
  contact,
  defaultType,
  isLoading = false,
  onOpenChange,
  onSubmit,
  open,
  relatableContacts,
  typeLabels,
}: {
  contact?: EditableContact;
  /** What a new contact starts as. The owner that opens this decides — a vet, or an address-book entry. */
  defaultType?: ContactType;
  /** Holds the form back until the record it edits has arrived — its defaults only seed once. */
  isLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ContactFormValues) => Promise<void>;
  open: boolean;
  /** Who this contact can be related to. Omitted, the relations section doesn't appear at all. */
  relatableContacts?: HouseholdContact[];
  typeLabels: Record<ContactType, string>;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'Create contact'}</DialogTitle>
          <DialogDescription>
            {contact ? 'Update this contact’s details.' : 'Add a doctor, vet, family member, or anyone else.'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Spinner className="min-h-40" />
        ) : (
          <ContactForm
            contact={contact}
            defaultType={defaultType}
            onDone={() => onOpenChange(false)}
            onSubmit={onSubmit}
            relatableContacts={relatableContacts}
            typeLabels={typeLabels}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  defaultType,
  onDone,
  onSubmit,
  relatableContacts,
  typeLabels,
}: {
  contact?: EditableContact;
  defaultType?: ContactType;
  onDone: () => void;
  onSubmit: (values: ContactFormValues) => Promise<void>;
  relatableContacts?: HouseholdContact[];
  typeLabels: Record<ContactType, string>;
}) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormModel),
    defaultValues: toDefaults(contact, defaultType),
  });

  // Watched rather than read once: these sections appear and disappear as the type is changed, in
  // the same dialog, before anything is saved.
  const selectedType = form.watch('type');
  const offersBirthday = showsPersonalDetails(selectedType, Boolean(contact?.dateOfBirth));

  const links = useFieldArray({ control: form.control, name: 'links' });
  const relations = useFieldArray({ control: form.control, name: 'relations' });

  const offersRelations =
    relatableContacts !== undefined && showsPersonalDetails(selectedType, relations.fields.length > 0);
  const relatedIds = new Set(relations.fields.map((relation) => relation.relatedContactId));

  const submit: SubmitHandler<ContactFormValues> = async (values) => {
    await onSubmit(values);
    onDone();
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Dr. Novak" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <span>{typeLabels[field.value]}</span>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contactType.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {typeLabels[option]}
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="name@example.com" type="email" value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. +386 40 123 456" value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {offersBirthday && (
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Birthday (optional)</FormLabel>
                  <FormControl>
                    <DateField onChange={field.onChange} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                {/* Spelled out rather than `{...field}`: an undefined `value` would flip the
                    component to uncontrolled mid-edit, and its `onChange` takes the string itself. */}
                <PlaceAutocomplete
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder="Street, city"
                  ref={field.ref}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Anything worth remembering" value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FormLabel>Links</FormLabel>
            <Button
              onClick={() => links.append({ name: '', url: '', type: 'web' })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              Add link
            </Button>
          </div>
          {links.fields.length === 0 ? (
            <p className="text-muted-foreground text-sm">No links yet. Add a website or social profile.</p>
          ) : (
            <div className="space-y-2">
              {links.fields.map((item, index) => (
                <div className="flex items-start gap-2" key={item.id}>
                  <FormField
                    control={form.control}
                    name={`links.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="w-32 shrink-0">
                        <FormControl>
                          <Input {...field} placeholder="Label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`links.${index}.url`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          {/* Plain text (not type="url") so a bare domain isn't blocked by native
                              validation before the schema prepends https://. */}
                          <Input {...field} placeholder="https://…" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`links.${index}.type`}
                    render={({ field }) => (
                      <FormItem className="w-28 shrink-0">
                        <Select onValueChange={field.onChange} value={field.value ?? 'web'}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <span>{contactLinkTypeLabels[field.value ?? 'web']}</span>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contactLinkType.options.map((option) => (
                              <SelectItem key={option} value={option}>
                                {contactLinkTypeLabels[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    aria-label="Remove link"
                    className="shrink-0"
                    onClick={() => links.remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {offersRelations && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FormLabel>Relations</FormLabel>
              <AddContactCombobox
                contacts={relatableContacts}
                label="Add relation"
                linkedIds={relatedIds}
                onCreate={() => toast.info('Save this contact first, then add the other person.')}
                onLink={async (relatedContactId) => {
                  const related = relatableContacts.find((candidate) => candidate.id === relatedContactId);

                  if (related) {
                    // The reverse wording isn't asked for here — `INVERSE_ROLE` fills it in, and the
                    // contact's own page is where an unusual one gets set.
                    relations.append({ relatedContactId, relatedContactName: related.name, role: 'friend' });
                  }
                }}
                typeLabels={typeLabels}
              />
            </div>
            {relations.fields.length === 0 ? (
              <p className="text-muted-foreground text-sm">No relations yet. Add a partner, parent or sibling.</p>
            ) : (
              <div className="space-y-2">
                {relations.fields.map((item, index) => (
                  <div className="flex items-center gap-2" key={item.id}>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.relatedContactName}</span>
                    <span className="shrink-0 text-muted-foreground text-sm">is</span>
                    <FormField
                      control={form.control}
                      name={`relations.${index}.role`}
                      render={({ field }) => (
                        <FormItem className="w-40 shrink-0">
                          <Select onValueChange={field.onChange} value={field.value ?? 'friend'}>
                            <FormControl>
                              <SelectTrigger aria-label={`${item.relatedContactName}'s relation`} className="w-full">
                                <span>{contactRelationRoleLabels[field.value ?? 'friend']}</span>
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
                    <Button
                      aria-label={`Remove ${item.relatedContactName}`}
                      className="shrink-0"
                      onClick={() => relations.remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {contact ? 'Save changes' : 'Create contact'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
