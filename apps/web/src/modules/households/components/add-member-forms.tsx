import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  createHouseholdMemberModel,
  createHouseholdMembersModel,
  householdMemberRole,
  inviteHouseholdMembersModel,
} from '@homewise/server/households';
import {
  Button,
  ButtonGroup,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';

import { HouseholdMemberRoleSelect } from './household-member-role-select';

const $postInvite = client.households.my.invite.$post;
type InviteMembersPayload = InferRequestType<typeof $postInvite>['json'];
const $postMember = client.households.my.members.$post;
type AddMembersPayload = InferRequestType<typeof $postMember>['json'];
type ManagedMemberInput = AddMembersPayload['members'][number];

const emptyInviteRow = () => ({ email: '', role: householdMemberRole.enum.adult });
const emptyManagedMember = () => ({ name: '', nickname: '', role: householdMemberRole.enum.child });
const emptyManagedRow = () => ({ name: '', role: householdMemberRole.enum.child });

/** Form footer: a full-width submit, or a right-aligned secondary action + submit when one is provided. */
function FormFooterActions({
  secondaryAction,
  submitting,
  submitLabel,
}: {
  secondaryAction?: ReactNode;
  submitting: boolean;
  submitLabel: ReactNode;
}) {
  if (secondaryAction) {
    return (
      <div className="flex justify-end">
        <ButtonGroup>
          {secondaryAction}
          <Button loading={submitting} type="submit">
            {submitLabel}
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  return (
    <Button className="w-full" loading={submitting} type="submit">
      {submitLabel}
    </Button>
  );
}

/** Email-invite form (one or more rows) that creates account members. */
function InviteMembersForm({ onInvited, secondaryAction }: { onInvited?: () => void; secondaryAction?: ReactNode }) {
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(inviteHouseholdMembersModel),
    defaultValues: { members: [emptyInviteRow()] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' });

  const { mutateAsync } = useMutation({
    mutationFn: async (data: InviteMembersPayload) =>
      parseResponse($postInvite({ json: data, query: { callbackUrl: window.location.origin } })),
  });

  const onSubmit: SubmitHandler<InviteMembersPayload> = async (data) => {
    try {
      await mutateAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      form.reset({ members: [emptyInviteRow()] });
      toast.success(`${data.members.length} ${data.members.length === 1 ? 'member' : 'members'} invited.`);
      onInvited?.();
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {fields.map((field, idx) => (
          <div className="flex items-end gap-2" key={field.id}>
            <FormField
              control={form.control}
              name={`members.${idx}.email`}
              render={({ field }) => (
                <FormItem className="grow">
                  {idx === 0 && <FormLabel>Email</FormLabel>}
                  <FormControl>
                    <Input {...field} placeholder="invitee@email.com" type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`members.${idx}.role`}
              render={({ field }) => (
                <FormItem className="grow-0">
                  {idx === 0 && <FormLabel>Role</FormLabel>}
                  <FormControl>
                    <HouseholdMemberRoleSelect
                      name={field.name}
                      onValueChange={field.onChange}
                      triggerClassName="w-30"
                      value={field.value}
                    />
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
          <Button className="grow-0" onClick={() => append(emptyInviteRow())} type="button" variant="ghost">
            <PlusIcon />
            Add more
          </Button>
        </div>
        <FormFooterActions
          secondaryAction={secondaryAction}
          submitLabel={`Send ${fields.length > 1 ? 'invites' : 'invite'}`}
          submitting={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}

/** Form for adding a managed member (child, pet, …) with no account. */
function AddManagedMemberForm({ onAdded, secondaryAction }: { onAdded?: () => void; secondaryAction?: ReactNode }) {
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(createHouseholdMemberModel),
    defaultValues: emptyManagedMember(),
  });

  const { mutateAsync } = useMutation({
    mutationFn: async (data: AddMembersPayload) => parseResponse($postMember({ json: data })),
  });

  const onSubmit: SubmitHandler<ManagedMemberInput> = async (data) => {
    try {
      await mutateAsync({ members: [data] });
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      form.reset(emptyManagedMember());
      toast.success(`${data.name} added to the household.`);
      onAdded?.();
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Rex, Grandma Jo" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nickname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nickname (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Optional nickname" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <HouseholdMemberRoleSelect
                  name={field.name}
                  onValueChange={field.onChange}
                  triggerClassName="w-40"
                  value={field.value}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormFooterActions
          secondaryAction={secondaryAction}
          submitLabel="Add member"
          submitting={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}

/** Inline, multi-row form for adding one or more managed members (name + role) at once. */
function AddManagedMembersForm({ onAdded, secondaryAction }: { onAdded?: () => void; secondaryAction?: ReactNode }) {
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(createHouseholdMembersModel),
    defaultValues: { members: [emptyManagedRow()] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' });

  const { mutateAsync } = useMutation({
    mutationFn: async (data: AddMembersPayload) => parseResponse($postMember({ json: data })),
  });

  const onSubmit: SubmitHandler<AddMembersPayload> = async (data) => {
    try {
      await mutateAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      form.reset({ members: [emptyManagedRow()] });
      toast.success(`${data.members.length} ${data.members.length === 1 ? 'member' : 'members'} added.`);
      onAdded?.();
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {fields.map((field, idx) => (
          <div className="flex items-end gap-2" key={field.id}>
            <FormField
              control={form.control}
              name={`members.${idx}.name`}
              render={({ field }) => (
                <FormItem className="grow">
                  {idx === 0 && <FormLabel>Name</FormLabel>}
                  <FormControl>
                    <Input {...field} placeholder="e.g. Rex, Grandma Jo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`members.${idx}.role`}
              render={({ field }) => (
                <FormItem className="grow-0">
                  {idx === 0 && <FormLabel>Role</FormLabel>}
                  <FormControl>
                    <HouseholdMemberRoleSelect
                      name={field.name}
                      onValueChange={field.onChange}
                      triggerClassName="w-30"
                      value={field.value}
                    />
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
          <Button className="grow-0" onClick={() => append(emptyManagedRow())} type="button" variant="ghost">
            <PlusIcon />
            Add more
          </Button>
        </div>
        <FormFooterActions
          secondaryAction={secondaryAction}
          submitLabel={`Add ${fields.length > 1 ? 'members' : 'member'}`}
          submitting={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}

/** Tabbed "add member" UI: invite via email vs. add a managed (no-account) member. */
export function AddMemberTabs({
  onInvited,
  onMemberAdded,
  secondaryAction,
  managedVariant = 'single',
}: {
  onInvited?: () => void;
  onMemberAdded?: () => void;
  secondaryAction?: ReactNode;
  /** 'single' renders one managed member (with nickname); 'multi' renders an inline multi-row name+role form. */
  managedVariant?: 'single' | 'multi';
}) {
  const [addMode, setAddMode] = useState<'invite' | 'managed'>('invite');

  return (
    <Tabs onValueChange={(value) => setAddMode(value as 'invite' | 'managed')} value={addMode}>
      <TabsList className="w-full">
        <TabsTrigger value="invite">Invite via email</TabsTrigger>
        <TabsTrigger value="managed">Add without account</TabsTrigger>
      </TabsList>
      <TabsContent value="invite">
        <InviteMembersForm onInvited={onInvited} secondaryAction={secondaryAction} />
      </TabsContent>
      <TabsContent value="managed">
        {managedVariant === 'multi' ? (
          <AddManagedMembersForm onAdded={onMemberAdded} secondaryAction={secondaryAction} />
        ) : (
          <AddManagedMemberForm onAdded={onMemberAdded} secondaryAction={secondaryAction} />
        )}
      </TabsContent>
    </Tabs>
  );
}
