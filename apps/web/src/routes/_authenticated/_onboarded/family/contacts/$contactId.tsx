import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  $deleteContact,
  ContactDialog,
  ContactFacts,
  ContactLinkChips,
  ContactRelationsCard,
  contactTypeLabels,
  getContactQueryOptions,
  invalidateContacts,
  showsPersonalDetails,
} from '@/modules/contacts';
import { Actionbar, ConfirmDeleteDialog, RouteError, serverMessage } from '@/modules/shared';

export const Route = createFileRoute('/_authenticated/_onboarded/family/contacts/$contactId')({
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getContactQueryOptions(Number(params.contactId)));
  },
  component: ContactDetailRoute,
  pendingComponent: () => <Spinner />,
  // Specific, because this one genuinely can vanish — another member may have deleted them while
  // this page was open, and a realtime refetch lands on a 404.
  errorComponent: () => (
    <RouteError description="They may have been removed by someone else in the household." title="This contact is gone">
      <Button asChild>
        <Link to="/family/contacts">Back to contacts</Link>
      </Button>
    </RouteError>
  ),
});

function ContactDetailRoute() {
  const { contactId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: contact } = useSuspenseQuery(getContactQueryOptions(Number(contactId)));

  const { mutateAsync: removeContact } = useMutation({
    mutationFn: async () => parseResponse($deleteContact({ param: { id: contactId } })),
  });

  const handleDelete = async () => {
    try {
      await removeContact();
      toast.success(`"${contact.name}" deleted.`);
      // Navigate first, then invalidate: refreshing this contact's query while its own page is still
      // mounted would resolve the delete into a 404 and throw the route into its error boundary.
      await navigate({ to: '/family/contacts' });
      invalidateContacts(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  const showsRelations = showsPersonalDetails(contact.type, contact.relations.length > 0);

  return (
    <>
      <Actionbar.Content>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/family/contacts">Contacts</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{contact.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="font-medium text-lg">{contact.name}</h1>
            <Badge variant="outline">{contactTypeLabels[contact.type]}</Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <PencilIcon />
                Edit contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                <TrashIcon />
                Delete contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-6 lg:max-w-2/3">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.description ? <p className="text-sm">{contact.description}</p> : null}
              <ContactFacts
                address={contact.address}
                dateOfBirth={
                  showsPersonalDetails(contact.type, Boolean(contact.dateOfBirth)) ? contact.dateOfBirth : null
                }
                email={contact.email}
                phone={contact.phone}
              />
              <ContactLinkChips links={contact.links} />
              {!contact.description &&
              !contact.address &&
              !contact.email &&
              !contact.phone &&
              !contact.dateOfBirth &&
              contact.links.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing recorded yet — add a phone number, an email or a birthday.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {showsRelations && <ContactRelationsCard contact={contact} />}
        </div>

        {editOpen && <ContactDialog contactId={contact.id} onOpenChange={setEditOpen} open={editOpen} />}

        <ConfirmDeleteDialog
          confirmLabel="Delete contact"
          description={
            <>
              "{contact.name}" will be removed from the household — including from any profile or loan that names them.
            </>
          }
          onConfirm={handleDelete}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title={`Delete "${contact.name}"?`}
        />
      </main>
    </>
  );
}
