import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import type z from 'zod';

import {
  type ContactLinkType,
  type ContactType,
  contactLinkType,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Textarea,
} from '@homewise/ui/core';

import { contactLinkTypeLabels } from '../helpers';

export type ContactFormValues = z.infer<typeof createContactModel>;

/** The subset of a contact the form edits — matches what the profile response nests. */
export type EditableContact = {
  type: ContactType;
  name: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  links: { name: string; url: string; type: ContactLinkType }[];
};

function toDefaults(contact?: EditableContact): ContactFormValues {
  return {
    type: contact?.type ?? 'medical',
    name: contact?.name ?? '',
    description: contact?.description ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    address: contact?.address ?? '',
    links: contact?.links ?? [],
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
  onOpenChange,
  onSubmit,
  open,
  typeLabels,
}: {
  contact?: EditableContact;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ContactFormValues) => Promise<void>;
  open: boolean;
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
        <ContactForm contact={contact} onDone={() => onOpenChange(false)} onSubmit={onSubmit} typeLabels={typeLabels} />
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  onDone,
  onSubmit,
  typeLabels,
}: {
  contact?: EditableContact;
  onDone: () => void;
  onSubmit: (values: ContactFormValues) => Promise<void>;
  typeLabels: Record<ContactType, string>;
}) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(createContactModel),
    defaultValues: toDefaults(contact),
  });

  const links = useFieldArray({ control: form.control, name: 'links' });

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
        </div>
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Street, city" value={field.value ?? ''} />
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

        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {contact ? 'Save changes' : 'Create contact'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
