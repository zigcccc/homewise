import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type InferRequestType, type InferResponseType } from 'hono';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { childSex, patchChildProfileModel } from '@homewise/server/child-profiles';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { getChildProfileQueryOptions, invalidateChildProfile } from '@/modules/child-profiles';
import { MedicalInfoCard } from '@/modules/medical';
import { DateField, sexLabels } from '@/modules/shared';

import { ProfilePictureField } from './-components/profile-picture-field';

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids/$profileId/general')({
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getChildProfileQueryOptions(Number(params.profileId)));
  },
  component: GeneralTab,
  pendingComponent: () => <Spinner />,
});

const $getProfile = client['child-profiles'][':id'].$get;
type ChildProfile = InferResponseType<typeof $getProfile, 200>;

const $patchProfile = client['child-profiles'][':id'].$patch;
type PatchProfileForm = InferRequestType<typeof $patchProfile>['form'];

/**
 * Editable basics: name comes from the household member; date of birth, sex, and picture live here.
 * `image` is just the preview src; `imageFile` is an uploaded photo, `avatarFile` a picked avatar
 * (the client sends its bytes, the server deduplicates the blob by the file's name).
 */
const generalFormModel = patchChildProfileModel.pick({ dateOfBirth: true, sex: true }).extend({
  image: z.string().nullish(),
  imageFile: z.instanceof(File).nullish(),
  avatarFile: z.instanceof(File).nullish(),
});

function defaults(profile: ChildProfile): z.infer<typeof generalFormModel> {
  return {
    dateOfBirth: profile.dateOfBirth ?? '',
    sex: profile.sex ?? '',
    image: profile.profilePicture ?? undefined,
    imageFile: undefined,
    avatarFile: undefined,
  };
}

function GeneralTab() {
  const { profileId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: profile } = useSuspenseQuery(getChildProfileQueryOptions(Number(profileId)));

  const form = useForm<z.infer<typeof generalFormModel>>({
    resolver: zodResolver(generalFormModel),
    defaultValues: defaults(profile),
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (payload: PatchProfileForm) =>
      parseResponse($patchProfile({ param: { id: profile.id.toString() }, form: payload })),
  });

  const onSubmit: SubmitHandler<z.infer<typeof generalFormModel>> = async (data) => {
    const payload: PatchProfileForm = { dateOfBirth: data.dateOfBirth ?? '', sex: data.sex ?? '' };

    // Picture resolves photo → avatar → clear, matching the server.
    if (data.imageFile instanceof File) {
      payload.image = data.imageFile;
    } else if (data.avatarFile instanceof File) {
      payload.avatar = data.avatarFile;
    } else if (!data.image && profile.profilePicture) {
      payload.image = '';
    }

    try {
      const updated = await mutateAsync(payload);
      invalidateChildProfile(queryClient, profile.id);
      form.reset(defaults(updated));
      toast.success('Profile updated.');
    } catch {
      toast.error('Something went wrong.');
    }
  };

  const formImage = form.watch('image');

  return (
    <div className="space-y-6">
      <Form {...form}>
        <Card className="lg:max-w-2/3">
          <CardHeader>
            <CardTitle>General information</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="flex items-start gap-6">
                <ProfilePictureField
                  currentImage={formImage}
                  displayName={profile.child.displayName}
                  onRemove={() => {
                    form.setValue('imageFile', null, { shouldDirty: true });
                    form.setValue('avatarFile', null, { shouldDirty: true });
                    form.setValue('image', null, { shouldDirty: true });
                  }}
                  onSelectAvatar={(file, previewSrc) => {
                    form.setValue('avatarFile', file, { shouldDirty: true });
                    form.setValue('imageFile', null, { shouldDirty: true });
                    form.setValue('image', previewSrc, { shouldDirty: true });
                  }}
                  onUploadFile={(file) => {
                    form.setValue('imageFile', file, { shouldDirty: true });
                    form.setValue('avatarFile', null, { shouldDirty: true });
                    form.setValue('image', URL.createObjectURL(file), { shouldDirty: true });
                  }}
                />
                {/* Height matches the avatar circle (size-24) so the text centers against it, not the taller picture column that also holds the button. */}
                <div className="flex h-24 flex-1 flex-col justify-center space-y-1">
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{profile.child.displayName}</p>
                  <p className="text-muted-foreground text-xs">
                    Edit the name on the{' '}
                    <Link className="underline hover:text-foreground" to="/manage/household-members">
                      household member
                    </Link>
                    .
                  </p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="dateOfBirth">Date of birth</FormLabel>
                      <FormControl>
                        <DateField id="dateOfBirth" onChange={field.onChange} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sex</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{field.value ? sexLabels[field.value] : 'Not set'}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {childSex.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {sexLabels[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button disabled={!form.formState.isDirty} loading={isPending} type="submit">
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </Form>

      <MedicalInfoCard
        key={profile.medicalInfo.id}
        medicalInfo={profile.medicalInfo}
        onChanged={() => invalidateChildProfile(queryClient, profile.id)}
      />
    </div>
  );
}
