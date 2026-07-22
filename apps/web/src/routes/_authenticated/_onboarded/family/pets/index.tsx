import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { differenceInYears, parseISO } from 'date-fns';
import { PawPrintIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

import { type PetType } from '@homewise/server/pet-profiles';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import { invalidatePetProfilesList, listPetProfilesQueryOptions, petTypeLabels } from '@/modules/pet-profiles';
import { Actionbar } from '@/modules/shared';

export const Route = createFileRoute('/_authenticated/_onboarded/family/pets/')({
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listPetProfilesQueryOptions()),
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
    ]);
  },
  component: PetsRoute,
  pendingComponent: () => <Spinner />,
});

/** Whole years since the date of birth, or null when no date is set. */
function ageInYears(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return null;
  }

  return differenceInYears(new Date(), parseISO(dateOfBirth));
}

/** A "Dog · Golden Retriever" line — type, breed, or both. Null when neither is set. */
function typeAndBreed(type: PetType | null, breed: string | null) {
  const label = type ? petTypeLabels[type] : null;
  return [label, breed].filter(Boolean).join(' · ') || null;
}

function PetsRoute() {
  const navigate = Route.useNavigate();
  const { queryClient } = Route.useRouteContext();
  const { data: profiles } = useSuspenseQuery(listPetProfilesQueryOptions());
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const { mutateAsync: createProfile, isPending } = useMutation({
    mutationFn: async (memberId: number) => parseResponse(client['pet-profiles'].$post({ json: { memberId } })),
  });

  // Pets are eligible for a profile until they have one.
  const petsWithoutProfile = household.members.filter(
    (member) => member.role === 'pet' && !profiles.some((profile) => profile.memberId === member.id)
  );

  const handleCreate = async (memberId: number, displayName: string) => {
    try {
      const profile = await createProfile(memberId);

      // Navigate before invalidating: refetching first re-renders this list (dropping the suggestion
      // button that was just clicked) while we're still on the page.
      toast.success(`Profile created for ${displayName}.`);
      await navigate({ to: '/family/pets/$profileId', params: { profileId: profile.id.toString() } });
      invalidatePetProfilesList(queryClient);
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
            <BreadcrumbItem>Family</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pets</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div>
          <h1 className="font-medium text-lg">Pets</h1>
          <p className="text-muted-foreground text-sm">A profile for each pet — the basics, and more to come.</p>
        </div>

        {profiles.length === 0 && petsWithoutProfile.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PawPrintIcon />
              </EmptyMedia>
              <EmptyTitle>No pets in this household yet</EmptyTitle>
              <EmptyDescription>
                Profiles are created for household members with the "pet" role. Add one to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/manage/household-members">
                  <UsersIcon />
                  Add a pet
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {profiles.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {profiles.map((profile) => {
                  const age = ageInYears(profile.dateOfBirth);
                  const details = typeAndBreed(profile.type, profile.breed);

                  return (
                    <Link key={profile.id} params={{ profileId: profile.id.toString() }} to="/family/pets/$profileId">
                      <Card className="h-full transition-colors hover:border-primary/50">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarImage alt={profile.pet.displayName} src={profile.profilePicture || undefined} />
                              <AvatarFallback>{profile.pet.displayName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            {profile.pet.displayName}
                          </CardTitle>
                          <CardDescription>
                            {age !== null ? `${age} ${age === 1 ? 'year' : 'years'} old` : 'Age not set'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="text-muted-foreground text-sm">{details ?? 'Type not set'}</CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            {petsWithoutProfile.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-medium text-sm">Suggestions</h2>
                <div className="flex flex-wrap gap-2">
                  {petsWithoutProfile.map((pet) => (
                    <Button
                      disabled={isPending}
                      key={pet.id}
                      onClick={() => handleCreate(pet.id, pet.displayName)}
                      variant="outline"
                    >
                      <PlusIcon />
                      Create profile for {pet.displayName}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
