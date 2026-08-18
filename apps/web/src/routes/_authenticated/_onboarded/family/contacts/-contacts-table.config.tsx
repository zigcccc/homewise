import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  createDataTableColumnHelper,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import {
  $deleteContact,
  ContactDialog,
  contactTypeLabels,
  type HouseholdContact,
  invalidateContacts,
} from '@/modules/contacts';
import { ConfirmDeleteDialog, formatDate, serverMessage } from '@/modules/shared';

const columnHelper = createDataTableColumnHelper<HouseholdContact>();

export const contactColumns = columnHelper.columns([
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => (
      <Link
        className="font-medium underline-offset-4 hover:underline"
        params={{ contactId: info.row.original.id.toString() }}
        to="/family/contacts/$contactId"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    cell: (info) => <Badge variant="outline">{contactTypeLabels[info.getValue()]}</Badge>,
  }),
  columnHelper.accessor('dateOfBirth', {
    header: 'Birthday',
    cell: (info) => <BirthdayCell dateOfBirth={info.getValue()} />,
  }),
  columnHelper.accessor('phone', {
    header: 'Phone',
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  columnHelper.accessor('email', {
    header: 'Email',
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    // The one cell that legitimately takes the whole row: its menu labels and delete dialog name the
    // record, and its edit dialog seeds a form from every field.
    cell: (info) => <ContactRowActions contact={info.row.original} />,
  }),
]);

function BirthdayCell({ dateOfBirth }: { dateOfBirth: string | null }) {
  if (!dateOfBirth) {
    return <span className="text-muted-foreground">—</span>;
  }

  return <span className="tabular-nums">{formatDate(dateOfBirth)}</span>;
}

function ContactRowActions({ contact }: { contact: HouseholdContact }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: removeContact } = useMutation({
    mutationFn: async () => parseResponse($deleteContact({ param: { id: contact.id.toString() } })),
  });

  const handleDelete = async () => {
    try {
      await removeContact();
      toast.success(`"${contact.name}" deleted.`);
      invalidateContacts(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
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

      {editOpen && <ContactDialog contactId={contact.id} onOpenChange={setEditOpen} open={editOpen} />}

      <ConfirmDeleteDialog
        confirmLabel="Delete contact"
        description={
          <>"{contact.name}" will be removed from the household — including from any profile or loan that names them.</>
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${contact.name}"?`}
      />
    </div>
  );
}
