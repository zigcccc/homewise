import {
  householdMemberRole,
  type InviteHouseholdMembers,
  inviteHouseholdMembersModel,
} from '@homewise/server/households';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@homewise/ui/core/breadcrumb';
import { Button } from '@homewise/ui/core/button';
import { ButtonGroup } from '@homewise/ui/core/button-group';
import { DataTable } from '@homewise/ui/core/data-table';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homewise/ui/core/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homewise/ui/core/empty';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@homewise/ui/core/form';
import { Input } from '@homewise/ui/core/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@homewise/ui/core/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@homewise/ui/core/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import clsx from 'clsx';
import { type InferRequestType } from 'hono';
import { PlusIcon, RefreshCwIcon, Rows3Icon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { client } from '@/api/client';
import { getMyHouseholdQueryOptions, listMyHouseholdActiveInvitesQueryOptions } from '@/modules/households';

import { Actionbar } from '../../-components/Actionbar';

import { invitesTableColumns, membersTableColumns } from './-household-members.config';

const householdMembersTab = z.enum(['members', 'invites']);
const $postInvite = client.households.my.invite.$post;
type InviteMembersPayload = InferRequestType<typeof $postInvite>['json'];

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
  const { queryClient } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());
  const { data: invites, refetch, isRefetching } = useSuspenseQuery(listMyHouseholdActiveInvitesQueryOptions());

  const { mutateAsync: inviteMembersAsync } = useMutation({
    mutationFn: async (data: InviteMembersPayload) =>
      $postInvite({
        json: data,
        query: { callbackUrl: window.location.origin },
      }),
  });

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(inviteHouseholdMembersModel),
    defaultValues: {
      members: [{ email: '', role: householdMemberRole.enum.adult }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' });

  const {
    reset,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

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

  const onSubmitValid: SubmitHandler<InviteHouseholdMembers> = async (data) => {
    try {
      await inviteMembersAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      setInviteDialogOpen(false);
      reset({ members: [{ email: '', role: householdMemberRole.enum.adult }] });
      toast.success(`${data.members.length} ${data.members.length === 1 ? 'member' : 'members'} invited.`);
    } catch {
      toast.error('Something went wrong.');
    }
  };

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
        <h1 className="text-lg font-medium">Manage "{household.name}" members</h1>
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
              <PlusIcon /> Invite
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
              <DialogTitle>Invite new member(s)</DialogTitle>
              <DialogDescription>
                By inviting them to your household, they'll be able to interact with data available in the dashboard.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form className="space-y-4">
                {fields.map((field, idx) => (
                  <div key={field.id} className="flex items-end gap-2">
                    <FormField
                      control={control}
                      name={`members.${idx}.email`}
                      render={({ field }) => (
                        <FormItem className="grow-1">
                          {idx === 0 && <FormLabel>Email</FormLabel>}
                          <FormControl>
                            <Input {...field} placeholder="invitee@email.com" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name={`members.${idx}.role`}
                      render={({ field }) => (
                        <FormItem className="grow-0">
                          {idx === 0 && <FormLabel>Role</FormLabel>}
                          <FormControl>
                            <Select name={field.name} onValueChange={field.onChange} value={field.value}>
                              <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Select a fruit" />
                              </SelectTrigger>
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
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button
                      className="grow-0 px-2"
                      disabled={fields.length === 1}
                      onClick={() => remove(idx)}
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-start pb-2">
                  <Button
                    className="grow-0"
                    onClick={() => append({ email: '', role: householdMemberRole.enum.adult })}
                    type="button"
                    variant="ghost"
                  >
                    <PlusIcon />
                    Add more
                  </Button>
                </div>
              </form>
            </Form>
            <DialogFooter>
              <ButtonGroup>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button loading={isSubmitting} onClick={handleSubmit(onSubmitValid)}>
                  Send {fields.length > 1 ? 'invites' : 'invite'}
                </Button>
              </ButtonGroup>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
