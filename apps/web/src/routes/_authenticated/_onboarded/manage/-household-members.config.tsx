import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { type InferRequestType, type InferResponseType } from 'hono';
import { BanIcon, MoreHorizontal, PencilIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  type HouseholdMemberRole,
  householdMemberRole,
  inviteExistingMemberModel,
  patchHouseholdMemberModel,
} from '@homewise/server/households';
import { Button } from '@homewise/ui/core/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homewise/ui/core/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homewise/ui/core/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@homewise/ui/core/form';
import { Input } from '@homewise/ui/core/input';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@homewise/ui/core/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core/tooltip';

import { client, parseResponse } from '@/api/client';
import { HouseholdMemberRoleSelectItems } from '@/modules/households/components';

type HouseholdMember = NonNullable<Awaited<InferResponseType<typeof client.households.my.$get>>>['members'][number];

const $patchMember = client.households.my.members[':id'].$patch;
type PatchMemberPayload = InferRequestType<typeof $patchMember>['json'];

const $inviteMember = client.households.my.members[':id'].invite.$post;
type InviteMemberPayload = InferRequestType<typeof $inviteMember>['json'];

const membersTableBuilder = createColumnHelper<HouseholdMember>();

export const membersTableColumns = [
  membersTableBuilder.accessor('id', {
    header: 'ID',
    cell(info) {
      return <span>{info.getValue()}</span>;
    },
  }),
  membersTableBuilder.accessor('displayName', {
    header: 'Name',
    cell(info) {
      return (
        <span>
          {info.getValue()}
          {info.row.original.isOwner && <span className="text-muted-foreground"> (owner)</span>}
        </span>
      );
    },
  }),
  membersTableBuilder.accessor('email', {
    header: 'Email',
    cell(info) {
      const email = info.getValue();
      return email ? <span>{email}</span> : <span className="text-muted-foreground">No account</span>;
    },
  }),
  membersTableBuilder.accessor('role', {
    header: 'Role',
    cell: function MembersTableRoleCell(info) {
      const { queryClient, user } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });
      const { mutateAsync: updateMemberRoleAsync, isPending: isUpdating } = useMutation({
        mutationFn: async (role: HouseholdMemberRole) =>
          parseResponse(
            client.households.my.members[':id'].$patch({
              param: { id: info.row.original.id.toString() },
              json: { role },
            })
          ),
      });

      const handleUpdateMemberRole = async (newRole: string) => {
        try {
          const parsedRole = householdMemberRole.parse(newRole);
          await updateMemberRoleAsync(parsedRole);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
        } catch {
          toast.error('Something went wrong');
        }
      };

      return (
        <Select
          disabled={isUpdating || info.row.original.householdOwnerId !== user.id}
          onValueChange={(newRole) => handleUpdateMemberRole(newRole)}
          value={info.getValue()!}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Member role" />
              </SelectTrigger>
            </TooltipTrigger>
            {info.row.original.householdOwnerId !== user?.id && (
              <TooltipContent side="left">Only owners can update members role</TooltipContent>
            )}
          </Tooltip>
          <SelectContent>
            <HouseholdMemberRoleSelectItems />
          </SelectContent>
        </Select>
      );
    },
  }),
  membersTableBuilder.display({
    id: 'actions',
    header: '',
    cell: function MembersTableActions(props) {
      const member = props.row.original;
      const { user, queryClient } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });
      const [editOpen, setEditOpen] = useState(false);
      const [inviteOpen, setInviteOpen] = useState(false);

      const { mutateAsync: transferOwnershipAsync } = useMutation({
        mutationFn: async (targetUserId: string) =>
          parseResponse(client.households.my.$patch({ json: { ownerId: targetUserId } })),
      });
      const { mutateAsync: removeMemberAsync } = useMutation({
        mutationFn: async (targetMemberId: number) =>
          parseResponse(client.households.my.members[':id'].$delete({ param: { id: targetMemberId.toString() } })),
      });

      const handleCopy = () => {
        navigator.clipboard.writeText(member.id.toString());
        toast.success('Value copied to clipboard.');
      };

      const handleTransferOwnership = async () => {
        if (!member.userId) {
          return;
        }
        try {
          await transferOwnershipAsync(member.userId);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
          toast.success(`Ownership successfully transfered to ${member.displayName}!`);
        } catch {
          toast.error('Something went wrong.');
        }
      };

      const handleRemoveHouseholdMember = async () => {
        try {
          const memberName = member.displayName;
          await removeMemberAsync(member.id);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
          toast.success(`${memberName} successfully removed from household.`);
        } catch {
          toast.error('Something went wrong.');
        }
      };

      const isCurrentUserOwner = member.householdOwnerId === user.id;
      const canManage = isCurrentUserOwner || member.userId === user.id;

      return (
        <>
          <DropdownMenu>
            <div className="flex justify-end">
              <DropdownMenuTrigger asChild>
                <Button className="h-8 w-8 p-0" variant="ghost">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleCopy}>Copy member ID</DropdownMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem disabled={!canManage} onClick={() => setEditOpen(true)}>
                      <PencilIcon />
                      Edit details
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {!canManage && (
                    <TooltipContent side="left">
                      Only the household owner or this member can edit their details
                    </TooltipContent>
                  )}
                </Tooltip>
                {member.isManaged && (
                  <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                    <UserPlusIcon />
                    Invite to create account
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled={!isCurrentUserOwner || member.isOwner || member.isManaged}
                      onClick={handleTransferOwnership}
                    >
                      Transfer ownership
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {member.isOwner && <TooltipContent side="left">Already an owner</TooltipContent>}
                  {member.isManaged && !member.isOwner && (
                    <TooltipContent side="left">Members without an account can't be owners</TooltipContent>
                  )}
                  {!isCurrentUserOwner && (
                    <TooltipContent side="left">Only owners can transfer ownership</TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled={!isCurrentUserOwner || member.isOwner}
                      onClick={handleRemoveHouseholdMember}
                      variant="destructive"
                    >
                      Remove member
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {isCurrentUserOwner && member.isOwner && (
                    <TooltipContent side="left">Before you can remove an owner, transfer the ownership</TooltipContent>
                  )}
                  {!isCurrentUserOwner && <TooltipContent side="left">Only owners can remove members</TooltipContent>}
                </Tooltip>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <EditMemberDialog member={member} onOpenChange={setEditOpen} open={editOpen} />
          {member.isManaged && (
            <InviteExistingMemberDialog member={member} onOpenChange={setInviteOpen} open={inviteOpen} />
          )}
        </>
      );
    },
  }),
];

function EditMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: HouseholdMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { queryClient } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });

  const form = useForm({
    resolver: zodResolver(patchHouseholdMemberModel),
    defaultValues: {
      name: member.isManaged ? (member.name ?? '') : undefined,
      nickname: member.nickname ?? '',
    },
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (json: PatchMemberPayload) =>
      parseResponse($patchMember({ param: { id: member.id.toString() }, json })),
  });

  const onSubmit: SubmitHandler<PatchMemberPayload> = async (data) => {
    try {
      await mutateAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      onOpenChange(false);
      toast.success('Member updated.');
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit member details</DialogTitle>
          <DialogDescription>
            {member.isManaged
              ? "Update this member's name and nickname."
              : 'This member manages their own name; you can set a household nickname.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {member.isManaged && (
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nickname</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Optional nickname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button loading={isPending} onClick={form.handleSubmit(onSubmit)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteExistingMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: HouseholdMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { queryClient } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });

  const form = useForm({
    resolver: zodResolver(inviteExistingMemberModel),
    defaultValues: { email: '' },
    mode: 'onChange',
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (json: InviteMemberPayload) =>
      parseResponse(
        $inviteMember({
          param: { id: member.id.toString() },
          json,
          query: { callbackUrl: window.location.origin },
        })
      ),
  });

  const onSubmit: SubmitHandler<InviteMemberPayload> = async (data) => {
    try {
      await mutateAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      onOpenChange(false);
      form.reset({ email: '' });
      toast.success(`Invite sent to ${data.email}.`);
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {member.displayName} to create an account</DialogTitle>
          <DialogDescription>
            We'll email an invite. When they accept, their account links to this existing member.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="invitee@email.com" type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!form.formState.isValid} loading={isPending} onClick={form.handleSubmit(onSubmit)}>
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HouseholdInvite = NonNullable<Awaited<InferResponseType<typeof client.households.my.invites.active.$get>>>[number];

const invitesTableBuilder = createColumnHelper<HouseholdInvite>();

export const invitesTableColumns = [
  invitesTableBuilder.accessor('id', {
    header: 'ID',
    cell(info) {
      return <span>{info.getValue()}</span>;
    },
  }),
  invitesTableBuilder.accessor('email', {
    header: 'E-mail',
    cell(info) {
      return <span>{info.getValue()}</span>;
    },
  }),
  invitesTableBuilder.accessor('role', {
    header: 'Role',
    cell(info) {
      return <span className="inline-block first-letter:capitalize">{info.getValue()}</span>;
    },
  }),
  invitesTableBuilder.accessor('createdAt', {
    header: 'Invited at',
    cell(info) {
      const formatted = dayjs(info.getValue()).format('DD. MM. YYYY @ HH:MM');
      return <span>{formatted}</span>;
    },
  }),
  invitesTableBuilder.display({
    header: '',
    id: 'actions',
    cell: function InvitesTableActions(props) {
      const { user, queryClient } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });
      const { mutateAsync: revokeInviteAsync } = useMutation({
        mutationFn: async (inviteId: number) =>
          parseResponse(client.households.my.invites[':id'].$delete({ param: { id: inviteId.toString() } })),
      });

      const handleRevokeInvite = async () => {
        try {
          await revokeInviteAsync(props.row.original.id);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
          toast.success('Invite revoked!');
        } catch {
          toast.error('Something went wrong.');
        }
      };

      return (
        <DropdownMenu>
          <div className="flex justify-end">
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 p-0" variant="ghost">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    disabled={props.row.original.household.ownerId !== user.id}
                    onClick={handleRevokeInvite}
                    variant="destructive"
                  >
                    <BanIcon />
                    Revoke invite
                  </DropdownMenuItem>
                </TooltipTrigger>
                {props.row.original.household.ownerId !== user.id && (
                  <TooltipContent>Only owners can revoke invites</TooltipContent>
                )}
              </Tooltip>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  }),
];
