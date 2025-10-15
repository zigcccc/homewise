import { householdMemberRole, inviteHouseholdMembersModel } from '@homewise/server/households';
import { Button } from '@homewise/ui/core/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@homewise/ui/core/form';
import { Input } from '@homewise/ui/core/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@homewise/ui/core/select';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type InferRequestType } from 'hono';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { client } from '@/api/client';
import { getMyHouseholdQueryOptions } from '@/modules/households';

const $postInvite = client.households.my.invite.$post;
type InviteMembersPayload = InferRequestType<typeof $postInvite>['json'];

export const Route = createFileRoute('/_authenticated/onboarding/invite-members')({
  async beforeLoad({ context }) {
    const household = await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions());
    if (!household) {
      throw redirect({ to: '/onboarding/create-household' });
    }
  },
  component: InviteMembersRoute,
});

function InviteMembersRoute() {
  const navigate = Route.useNavigate();
  const { queryClient } = Route.useRouteContext();
  const form = useForm({
    resolver: zodResolver(inviteHouseholdMembersModel),
    defaultValues: {
      members: [{ email: '', role: householdMemberRole.enum.adult }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'members' });
  const { mutateAsync: inviteMembersAsync } = useMutation({
    mutationFn: async (data: InviteMembersPayload) =>
      $postInvite({
        json: data,
        query: { callbackUrl: window.location.origin },
      }),
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmitValid: SubmitHandler<InviteMembersPayload> = async (data) => {
    try {
      await inviteMembersAsync(data);
      await queryClient.refetchQueries({ queryKey: ['households'] });
      navigate({ to: '/' });
    } catch {
      toast.error('Something went wrong...');
    }
  };

  const handleSkip = () => {
    navigate({ to: '/' });
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmitValid, console.log)}>
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
        <div className="flex flex-col gap-2">
          <Button loading={isSubmitting} type="submit">
            Invite
          </Button>
          <Button onClick={handleSkip} type="button" variant="outline">
            Skip for now
          </Button>
        </div>
      </form>
    </Form>
  );
}
