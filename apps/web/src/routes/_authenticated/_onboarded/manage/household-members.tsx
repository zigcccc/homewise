import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import clsx from 'clsx';
import { PlusIcon, RefreshCwIcon, Rows3Icon } from 'lucide-react';
import { useState } from 'react';
import z from 'zod';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@homewise/ui/core/breadcrumb';
import { Button } from '@homewise/ui/core/button';
import { ButtonGroup } from '@homewise/ui/core/button-group';
import { DataTable } from '@homewise/ui/core/data-table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homewise/ui/core/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homewise/ui/core/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@homewise/ui/core/tabs';

import { getMyHouseholdQueryOptions, listMyHouseholdActiveInvitesQueryOptions } from '@/modules/households';
import { AddMemberTabs } from '@/modules/households/components';
import { Actionbar } from '../../-components/Actionbar';
import { invitesTableColumns, membersTableColumns } from './-household-members.config';

const householdMembersTab = z.enum(['members', 'invites']);

export const Route = createFileRoute('/_authenticated/_onboarded/manage/household-members')({
  validateSearch: z.object({ tab: householdMembersTab.default('members').catch('members') }),
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
      context.queryClient.ensureQueryData(listMyHouseholdActiveInvitesQueryOptions()),
    ]);
  },
  component: HouseholdMembersRoute,
});

function HouseholdMembersRoute() {
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());
  const { data: invites, refetch, isRefetching } = useSuspenseQuery(listMyHouseholdActiveInvitesQueryOptions());

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const membersTable = useReactTable({
    data: household.members,
    columns: membersTableColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const invitesTable = useReactTable({
    data: invites,
    columns: invitesTableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

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
              <BreadcrumbPage>Household members</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>
      <main className="flex-1 space-y-4 p-4">
        <h1 className="font-medium text-lg">Manage "{household.name}" members</h1>
        <Tabs
          onValueChange={(tab) =>
            navigate({ to: '/manage/household-members', search: { tab: tab as z.Infer<typeof householdMembersTab> } })
          }
          value={tab}
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="members">Members ({household.members.length})</TabsTrigger>
              <TabsTrigger value="invites">Pending invites ({invites.length})</TabsTrigger>
            </TabsList>
            <Button className="pr-4" onClick={() => setInviteDialogOpen(true)} size="sm">
              <PlusIcon /> Add member
            </Button>
          </div>
          <TabsContent value="members">
            <DataTable table={membersTable} />
          </TabsContent>
          <TabsContent value="invites">
            <DataTable
              emptyContent={
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Rows3Icon />
                    </EmptyMedia>
                    <EmptyTitle>No active invites found</EmptyTitle>
                    <EmptyDescription>Your household doesn't currently have any pending invites.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <ButtonGroup>
                      <Button onClick={() => refetch()} variant="outline">
                        <RefreshCwIcon className={clsx(isRefetching && 'animate-spin')} />{' '}
                        {isRefetching ? 'Refreshing...' : 'Refresh'}
                      </Button>
                      <Button onClick={() => setInviteDialogOpen(true)}>Send an invite</Button>
                    </ButtonGroup>
                  </EmptyContent>
                </Empty>
              }
              table={invitesTable}
            />
          </TabsContent>
        </Tabs>
        <Dialog onOpenChange={setInviteDialogOpen} open={inviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a household member</DialogTitle>
              <DialogDescription>
                Invite someone with an email to create their own account, or add a member (child, pet, …) that you
                manage on their behalf.
              </DialogDescription>
            </DialogHeader>
            <AddMemberTabs
              onInvited={() => setInviteDialogOpen(false)}
              onMemberAdded={() => setInviteDialogOpen(false)}
              secondaryAction={
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
              }
            />
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
