import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { type InferRequestType } from 'hono';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { type CreateHousehold, createHouseholdModel } from '@homewise/server/households';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from '@homewise/ui/core';

import { client } from '@/api/client';
import { getMyHouseholdQueryOptions } from '@/modules/households';

export const Route = createFileRoute('/_authenticated/onboarding/create-household')({
  async beforeLoad({ context }) {
    const household = await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()).catch(() => null);
    if (household) {
      throw redirect({ to: '/onboarding/invite-members' });
    }
  },
  component: CreateHouseholdComponent,
});

function CreateHouseholdComponent() {
  const navigate = Route.useNavigate();
  const { queryClient } = Route.useRouteContext();
  const { mutateAsync: createHouseholdAsync } = useMutation({
    mutationFn: async (data: InferRequestType<typeof client.households.$post>['json']) =>
      client.households.$post({ json: data }),
  });
  const form = useForm({
    resolver: zodResolver(createHouseholdModel),
    defaultValues: {
      name: '',
    },
  });
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmitValid: SubmitHandler<CreateHousehold> = async (data) => {
    try {
      await createHouseholdAsync(data);
      await queryClient.refetchQueries({ queryKey: ['households'] });
      navigate({ to: '/onboarding/invite-members' });
    } catch {
      toast.error('Something went wrong...');
    }
  };

  return (
    <Form {...form}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmitValid)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Household name</FormLabel>
              <FormControl>
                <Input placeholder="My Awesome Family" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button loading={isSubmitting} type="submit">
          Create
        </Button>
      </form>
    </Form>
  );
}
