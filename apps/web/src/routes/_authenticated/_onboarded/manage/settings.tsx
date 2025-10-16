import { patchHouseholdModel } from '@homewise/server/households';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@homewise/ui/core/breadcrumb';
import { Button } from '@homewise/ui/core/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@homewise/ui/core/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@homewise/ui/core/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@homewise/ui/core/form';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core/tooltip';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type InferRequestType } from 'hono';
import { SaveIcon, TrashIcon } from 'lucide-react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { client, DetailedError, parseResponse } from '@/api/client';
import { getMyHouseholdQueryOptions } from '@/modules/households';

import { Actionbar } from '../../-components/Actionbar';

const $deleteHousehold = client.households.my.$delete;
const $patchHousehold = client.households.my.$patch;
type PatchHouseholdPayload = InferRequestType<typeof $patchHousehold>['json'];

export const Route = createFileRoute('/_authenticated/_onboarded/manage/settings')({
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getMyHouseholdQueryOptions());
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const navigate = Route.useNavigate();
  const { queryClient, user } = Route.useRouteContext();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());
  const { mutateAsync: patchHouseholdAsync } = useMutation({
    mutationFn: async (payload: PatchHouseholdPayload) => parseResponse($patchHousehold({ json: payload })),
  });
  const { mutateAsync: deleteAsync, isPending: isDeleting } = useMutation({
    mutationFn: async () => $deleteHousehold(),
  });
  const form = useForm({
    resolver: zodResolver(patchHouseholdModel),
    defaultValues: {
      name: household.name,
      ownerId: household.ownerId,
    },
  });
  const confirmDeletionForm = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().refine((input) => input === household.name, { error: 'Name must match household name' }),
      })
    ),
    defaultValues: {
      name: '',
    },
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty },
    reset,
  } = form;

  const {
    formState: { isValid: canDelete },
  } = confirmDeletionForm;

  const onSubmitValid: SubmitHandler<PatchHouseholdPayload> = async (data) => {
    try {
      await patchHouseholdAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
      reset(data);
    } catch (err) {
      toast.error(err instanceof DetailedError ? err.detail?.data : 'Something went wrong.');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAsync();
      queryClient.resetQueries({ queryKey: ['households'] });
      navigate({ to: '/onboarding/create-household' });
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
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>
      <main className="flex-1 space-y-4 p-4">
        <h1 className="text-lg font-medium">Manage "{household.name}" household</h1>
        <Card className="lg:max-w-1/2">
          <Form {...form}>
            <CardHeader>
              <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Household name</FormLabel>
                    <FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Input
                            {...field}
                            className="max-w-72"
                            disabled={household.ownerId !== user.id}
                            onBlur={handleSubmit(onSubmitValid)}
                            placeholder="The Doe Family"
                          />
                        </TooltipTrigger>
                        {household.ownerId !== user.id && (
                          <TooltipContent>Only the household owner can change its name</TooltipContent>
                        )}
                      </Tooltip>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Household owner</FormLabel>
                    <FormControl className="max-w-72">
                      <Select
                        disabled={household.ownerId !== user.id}
                        name={field.name}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SelectTrigger className="w-72">
                              <SelectValue placeholder="Select an owner" />
                            </SelectTrigger>
                          </TooltipTrigger>
                          {household.ownerId !== user.id && (
                            <TooltipContent>Only the household owner can transfer the ownership</TooltipContent>
                          )}
                        </Tooltip>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Household members</SelectLabel>
                            {household.members.map((member) => (
                              <SelectItem key={member.id} value={member.userId}>
                                {member.user.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-row justify-end">
              <Button disabled={!isDirty} loading={isSubmitting} onClick={handleSubmit(onSubmitValid)}>
                <SaveIcon /> Save changes
              </Button>
            </CardFooter>
          </Form>
        </Card>
        <Card className="border-red-300 lg:max-w-1/2">
          <Form {...form}>
            <CardHeader>
              <CardTitle className="text-red-600">Danger zone</CardTitle>
              <CardDescription>Delete "{household.name}" household</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Caution! Once the household is deleted, all data assocciated with it, including household members, are
                deleted as well. This action is permanent and ireversabile
              </p>
            </CardContent>
            <CardFooter className="flex flex-row justify-end">
              <Dialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button disabled={household.ownerId !== user.id} variant="destructive">
                        <TrashIcon />
                        Delete household
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  {household.ownerId !== user.id && (
                    <TooltipContent>Only the household owner can delete the household</TooltipContent>
                  )}
                </Tooltip>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                      Before you can proceed, please input the household name.
                    </p>
                    <Form {...confirmDeletionForm}>
                      <FormField
                        control={confirmDeletionForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Household name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="The name of your household" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Form>
                  </div>
                  <DialogFooter>
                    <Button disabled={!canDelete} loading={isDeleting} onClick={handleDelete} variant="destructive">
                      <TrashIcon /> Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardFooter>
          </Form>
        </Card>
      </main>
    </>
  );
}
