import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';
import { AtSignIcon, GlobeIcon, LinkIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { patchMedicalInfoModel } from '@homewise/server/medical';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Separator,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import {
  AddContactCombobox,
  ContactFormDialog,
  type ContactFormValues,
  contactTypeLabels,
  invalidateContacts,
  listContactsQueryOptions,
  petContactTypeLabels,
} from '@/modules/contacts';
import { ConfirmDeleteDialog, UnsavedChangesDialog } from '@/modules/shared';

const $patchInfo = client['medical-info'][':id'].$patch;
const $postContact = client['medical-info'][':id'].contacts.$post;
const $linkContact = client['medical-info'][':id'].contacts[':contactId'].$post;
const $deleteContact = client['medical-info'][':id'].contacts[':contactId'].$delete;
const $patchContact = client.contacts[':id'].$patch;

/** A linked contact, as the profile response nests it. */
export type MedicalContact = InferResponseType<typeof $postContact, 201>;

export type MedicalInfo = {
  id: number;
  medicalIdNumber: string | null;
  contacts: MedicalContact[];
};

type PatchInfoPayload = InferRequestType<typeof $patchInfo>['json'];

const infoFormModel = patchMedicalInfoModel.required();

/** Icon per link type — a website, a social profile, or anything else. */
const linkIcons = { web: GlobeIcon, social: AtSignIcon, other: LinkIcon } as const;

/**
 * The "Medical information" card shown below general info on both profile types. Owns its own forms and
 * mutations (ID number + linked contacts), independent of the general form. `onChanged` refreshes the
 * owning profile query; `petLabels` relabels the `medical` contact type as the pet's vet.
 */
export function MedicalInfoCard({
  medicalInfo,
  onChanged,
  petLabels = false,
}: {
  medicalInfo: MedicalInfo;
  onChanged: () => void;
  petLabels?: boolean;
}) {
  const typeLabels = petLabels ? petContactTypeLabels : contactTypeLabels;
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalContact | undefined>(undefined);
  const [removing, setRemoving] = useState<MedicalContact | undefined>(undefined);

  // The whole household address book; the picker disables the ones already linked here.
  const { data: allContacts } = useQuery(listContactsQueryOptions());
  const linkedIds = new Set(medicalInfo.contacts.map((contact) => contact.id));

  const form = useForm<z.infer<typeof infoFormModel>>({
    resolver: zodResolver(infoFormModel),
    defaultValues: { medicalIdNumber: medicalInfo.medicalIdNumber ?? '' },
  });

  const { mutateAsync: patchInfo, isPending: isSavingInfo } = useMutation({
    mutationFn: async (json: PatchInfoPayload) =>
      parseResponse($patchInfo({ param: { id: medicalInfo.id.toString() }, json })),
  });

  const saveInfo: SubmitHandler<z.infer<typeof infoFormModel>> = async (data) => {
    try {
      const updated = await patchInfo({ medicalIdNumber: data.medicalIdNumber ?? '' });
      onChanged();
      form.reset({ medicalIdNumber: updated.medicalIdNumber ?? '' });
      toast.success('Medical information updated.');
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const submitContact = async (values: ContactFormValues) => {
    try {
      if (editing) {
        await parseResponse($patchContact({ param: { id: editing.id.toString() }, json: values }));
      } else {
        await parseResponse($postContact({ param: { id: medicalInfo.id.toString() }, json: values }));
      }
    } catch (error) {
      toast.error(editing ? 'Could not update contact.' : 'Could not add contact.');
      throw error; // Keep the dialog open so the user can retry.
    }
    toast.success(editing ? 'Contact updated.' : 'Contact added.');
    onChanged();
    invalidateContacts(queryClient);
  };

  const linkContact = async (contactId: number) => {
    try {
      await parseResponse($linkContact({ param: { id: medicalInfo.id.toString(), contactId: contactId.toString() } }));
      onChanged();
      toast.success('Contact added.');
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const openCreateDialog = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const removeContact = async () => {
    if (!removing) {
      return;
    }
    try {
      await parseResponse(
        $deleteContact({ param: { id: medicalInfo.id.toString(), contactId: removing.id.toString() } })
      );
    } catch (error) {
      toast.error('Could not remove contact.');
      throw error; // Keep the confirm dialog open so the user can retry.
    }
    onChanged();
    toast.success('Contact removed.');
  };

  return (
    <Card className="lg:max-w-2/3">
      <CardHeader>
        <CardTitle>Medical information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(saveInfo)}>
            <FormField
              control={form.control}
              name="medicalIdNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="medicalIdNumber">Medical ID number</FormLabel>
                  <FormControl>
                    <Input id="medicalIdNumber" placeholder="e.g. insurance or health number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.isDirty && (
              <div className="flex justify-end">
                <Button loading={isSavingInfo} type="submit">
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </Form>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Contacts</h3>
            <AddContactCombobox
              contacts={allContacts ?? []}
              linkedIds={linkedIds}
              onCreate={openCreateDialog}
              onLink={linkContact}
              typeLabels={typeLabels}
            />
          </div>

          {medicalInfo.contacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No contacts yet. Add a doctor, vet, or emergency contact.</p>
          ) : (
            <ul className="space-y-2">
              {medicalInfo.contacts.map((contact) => (
                <li className="flex items-start justify-between gap-4 rounded-lg border p-3" key={contact.id}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{contact.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                        {typeLabels[contact.type]}
                      </span>
                    </div>
                    {contact.description ? (
                      <p className="text-muted-foreground text-sm">{contact.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
                      {contact.email ? (
                        <span className="flex items-center gap-1">
                          <MailIcon className="size-3.5" />
                          {contact.email}
                        </span>
                      ) : null}
                      {contact.phone ? (
                        <span className="flex items-center gap-1">
                          <PhoneIcon className="size-3.5" />
                          {contact.phone}
                        </span>
                      ) : null}
                      {contact.address ? (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="size-3.5" />
                          {contact.address}
                        </span>
                      ) : null}
                    </div>
                    {contact.links.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {contact.links.map((link) => {
                          const Icon = linkIcons[link.type];
                          return (
                            <a
                              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
                              href={link.url}
                              key={link.id}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <Icon className="size-3" />
                              {link.name}
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={`Edit ${contact.name}`}
                      onClick={() => {
                        setEditing(contact);
                        setFormOpen(true);
                      }}
                      size="icon"
                      variant="ghost"
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      aria-label={`Remove ${contact.name}`}
                      onClick={() => setRemoving(contact)}
                      size="icon"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <ContactFormDialog
        contact={editing}
        onOpenChange={setFormOpen}
        onSubmit={submitContact}
        open={formOpen}
        typeLabels={typeLabels}
      />

      <ConfirmDeleteDialog
        confirmLabel="Remove"
        description={
          <>
            Remove <span className="font-medium">{removing?.name}</span> from this profile’s contacts? The contact stays
            in your household and can be added again.
          </>
        }
        onConfirm={removeContact}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        open={Boolean(removing)}
        title="Remove contact"
      />

      <UnsavedChangesDialog when={form.formState.isDirty} />
    </Card>
  );
}
