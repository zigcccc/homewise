import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@homewise/ui/core/breadcrumb';
import { Button } from '@homewise/ui/core/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@homewise/ui/core/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@homewise/ui/core/form';
import { ImageInput } from '@homewise/ui/core/image-input';
import { Input } from '@homewise/ui/core/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@homewise/ui/core/tooltip';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { SaveIcon, TrashIcon } from 'lucide-react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { client, parseResponse } from '@/api/client';
import { getSessionQueryOptions } from '@/auth/queries';

import { Actionbar } from '../-components/Actionbar';

const userProfileFormModel = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  createdAt: z.date(),
  image: z.url().nullish(),
  imageFile: z.file().nullish(),
});
type UserProfileForm = z.infer<typeof userProfileFormModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/user-profile')({
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getSessionQueryOptions());
  },
  component: UserProfileRoute,
});

function UserProfileRoute() {
  const { queryClient } = Route.useRouteContext();
  const { data: authData } = useSuspenseQuery(getSessionQueryOptions());
  const { mutateAsync: updateProfileAsync } = useMutation({
    mutationFn: async ({ name, imageFile }: UserProfileForm) => {
      return parseResponse(client.users.me.$patch({ form: { image: imageFile ?? undefined, name } }));
    },
  });
  const { mutateAsync: deleteProfilePicture } = useMutation({
    mutationFn: async () => {
      return parseResponse(client.users.me['profile-picture'].$delete());
    },
    onSuccess: () => {
      toast.success('Profile image deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
  });

  const form = useForm({
    resolver: zodResolver(userProfileFormModel),
    defaultValues: {
      id: authData.data?.user.id ?? '',
      email: authData.data?.user.email ?? '',
      name: authData.data?.user.name ?? '',
      createdAt: authData.data?.user.createdAt ?? new Date(),
      image: authData.data?.user.image || undefined,
      imageFile: undefined,
    },
  });

  const {
    formState: { isDirty, isSubmitting },
    handleSubmit,
    watch,
    reset,
  } = form;

  const formImage = watch('image');

  const onSubmitValid: SubmitHandler<UserProfileForm> = async (data) => {
    try {
      await updateProfileAsync(data);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
      reset(data);
      toast.success('Profile updated successfully.');
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
              <BreadcrumbPage>{authData.data?.user.name}'s profile</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>
      <main className="flex-1 space-y-4 p-4">
        <h1 className="text-lg font-medium">Your profile</h1>
        <Form {...form}>
          <Card className="lg:max-w-1/2">
            <CardHeader>
              <CardTitle>Personal information</CardTitle>
              <CardDescription>Add or edit your personal info.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <FormField
                control={form.control}
                name="imageFile"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <ImageInput
                        ref={field.ref}
                        currentImage={formImage}
                        name={field.name}
                        onChange={field.onChange}
                        onImagePreview={(imageUrl) => form.setValue('image', imageUrl)}
                        onRemoveImage={() => {
                          deleteProfilePicture();
                          reset(form.getValues());
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1 self-center">
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John Doe" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-row justify-end gap-3">
              <Button disabled={!isDirty} loading={isSubmitting} onClick={handleSubmit(onSubmitValid)}>
                <SaveIcon /> Save changes
              </Button>
            </CardFooter>
          </Card>
          <Card className="lg:max-w-1/2">
            <CardHeader>
              <CardTitle>System information</CardTitle>
              <CardDescription>Reach out to support team if you need to edit these fields.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account ID</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} disabled placeholder="your.email@something.com" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="createdAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Created at</FormLabel>
                    <FormControl>
                      <Input {...field} disabled value={dayjs(field.value).format('DD. MM. YYYY')} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          <Card className="border-red-300 lg:max-w-1/2">
            <CardHeader>
              <CardTitle className="text-red-600">Danger zone</CardTitle>
              <CardDescription>Delete your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Caution! Once the account is deleted, all data assocciated with it, including household and all its
                members, are deleted as well. This action is permanent and ireversabile.
              </p>
            </CardContent>
            <CardFooter className="flex flex-row justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button disabled variant="destructive">
                    <TrashIcon />
                    Delete account
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-lg text-wrap">
                  This feature is currently not supported. Reach out to our support team if you need to permanently
                  delete your account.
                </TooltipContent>
              </Tooltip>
            </CardFooter>
          </Card>
        </Form>
      </main>
    </>
  );
}
