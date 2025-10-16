import { type HouseholdMemberRole, householdMemberRole } from '@homewise/server/households';
import { Button } from '@homewise/ui/core/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homewise/ui/core/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@homewise/ui/core/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core/tooltip';
import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { type InferResponseType } from 'hono';
import { BanIcon, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { client, parseResponse } from '@/api/client';

type HouseholdMember = NonNullable<Awaited<InferResponseType<typeof client.households.my.$get>>>['members'][number];

const membersTableBuilder = createColumnHelper<HouseholdMember>();

export const membersTableColumns = [
  membersTableBuilder.accessor('id', {
    header: 'ID',
    cell(info) {
      return <span>{info.getValue()}</span>;
    },
  }),
  membersTableBuilder.accessor('user.name', {
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
  membersTableBuilder.accessor('user.email', {
    header: 'Email',
    cell(info) {
      return <span>{info.getValue()}</span>;
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
            <SelectGroup>
              <SelectLabel>Household member role</SelectLabel>
              <SelectItem value={householdMemberRole.enum.adult}>Adult</SelectItem>
              <SelectItem value={householdMemberRole.enum.child}>Child</SelectItem>
              <SelectItem value={householdMemberRole.enum.pet}>Pet</SelectItem>
              <SelectItem value={householdMemberRole.enum.external}>External</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );
    },
  }),
  membersTableBuilder.display({
    id: 'actions',
    header: '',
    cell: function MembersTableActions(props) {
      const { user, queryClient } = useRouteContext({ from: '/_authenticated/_onboarded/manage/household-members' });
      const { mutateAsync: transferOwnershipAsync } = useMutation({
        mutationFn: async (targetUserId: string) =>
          parseResponse(client.households.my.$patch({ json: { ownerId: targetUserId } })),
      });
      const { mutateAsync: removeMemberAsync } = useMutation({
        mutationFn: async (targetMemberId: number) =>
          parseResponse(client.households.my.members[':id'].$delete({ param: { id: targetMemberId.toString() } })),
      });

      const handleCopy = () => {
        navigator.clipboard.writeText(props.row.original.id.toString());
        toast.success('Value copied to clipboard.');
      };

      const handleTransferOwnership = async () => {
        try {
          await transferOwnershipAsync(props.row.original.userId);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
          toast.success(`Ownership successfully transfered to ${props.row.original.user.name}!`);
        } catch {
          toast.error('Something went wrong.');
        }
      };

      const handleRemoveHouseholdMember = async () => {
        try {
          const memberName = props.row.original.user.name;
          await removeMemberAsync(props.row.original.id);
          await queryClient.invalidateQueries({ queryKey: ['households'] });
          toast.success(`${memberName} successfully removed from household.`);
        } catch {
          toast.error('Something went wrong.');
        }
      };

      const isCurrentUserOwner = props.row.original.householdOwnerId === user.id;

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
              <DropdownMenuItem onClick={handleCopy}>Copy member ID</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    disabled={!isCurrentUserOwner || props.row.original.isOwner}
                    onClick={handleTransferOwnership}
                  >
                    Transfer ownership
                  </DropdownMenuItem>
                </TooltipTrigger>
                {props.row.original.isOwner && <TooltipContent side="left">Already an owner</TooltipContent>}
                {!isCurrentUserOwner && <TooltipContent side="left">Only owners can transfer ownership</TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    disabled={!isCurrentUserOwner || props.row.original.isOwner}
                    onClick={handleRemoveHouseholdMember}
                    variant="destructive"
                  >
                    Remove member
                  </DropdownMenuItem>
                </TooltipTrigger>
                {isCurrentUserOwner && props.row.original.isOwner && (
                  <TooltipContent side="left">Before you can remove an owner, transfer the ownership</TooltipContent>
                )}
                {!isCurrentUserOwner && <TooltipContent side="left">Only owners can remove members</TooltipContent>}
              </Tooltip>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  }),
];

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
