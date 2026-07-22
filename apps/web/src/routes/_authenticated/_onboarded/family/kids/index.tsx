import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { differenceInYears, parseISO } from 'date-fns';
import { BabyIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

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
import { listChildProfilesQueryOptions } from '@/modules/child-profiles';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import { Actionbar } from '@/modules/shared';

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids/')({
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listChildProfilesQueryOptions()),
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
    ]);
  },
  component: KidsRoute,
  pendingComponent: () => <Spinner />,
});

/** Whole years since the date of birth, or null when no date is set. */
function ageInYears(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return null;
  }

  return differenceInYears(new Date(), parseISO(dateOfBirth));
}

function KidsRoute() {
  const navigate = Route.useNavigate();
  const { queryClient } = Route.useRouteContext();
  const { data: profiles } = useSuspenseQuery(listChildProfilesQueryOptions());
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const { mutateAsync: createProfile, isPending } = useMutation({
    mutationFn: async (memberId: number) => parseResponse(client['child-profiles'].$post({ json: { memberId } })),
  });

  // Children are eligible for a profile until they have one.
  const childrenWithoutProfile = household.members.filter(
    (member) => member.role === 'child' && !profiles.some((profile) => profile.memberId === member.id)
  );

  const handleCreate = async (memberId: number, displayName: string) => {
    try {
      const profile = await createProfile(memberId);

      // Navigate before invalidating: refetching first re-renders this list (dropping the suggestion
      // button that was just clicked) while we're still on the page.
      toast.success(`Profile created for ${displayName}.`);
      await navigate({ to: '/family/kids/$profileId', params: { profileId: profile.id.toString() } });
      void queryClient.invalidateQueries({ queryKey: ['child-profiles', 'list'], exact: true });
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
              <BreadcrumbPage>Kids</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div>
          <h1 className="font-medium text-lg">Kids</h1>
          <p className="text-muted-foreground text-sm">
            A profile for each child — the basics, their dictionary, and more to come.
          </p>
        </div>

        {profiles.length === 0 && childrenWithoutProfile.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BabyIcon />
              </EmptyMedia>
              <EmptyTitle>No children in this household yet</EmptyTitle>
              <EmptyDescription>
                Profiles are created for household members with the "child" role. Add one to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/manage/household-members">
                  <UsersIcon />
                  Add a child
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
                  const wordCount = profile.dictionary?.entryCount ?? 0;

                  return (
                    <Link key={profile.id} params={{ profileId: profile.id.toString() }} to="/family/kids/$profileId">
                      <Card className="h-full transition-colors hover:border-primary/50">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarImage alt={profile.child.displayName} src={profile.profilePicture || undefined} />
                              <AvatarFallback>{profile.child.displayName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            {profile.child.displayName}
                          </CardTitle>
                          <CardDescription>
                            {age !== null ? `${age} ${age === 1 ? 'year' : 'years'} old` : 'Age not set'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="text-muted-foreground text-sm">
                          {wordCount} {wordCount === 1 ? 'word' : 'words'} in the dictionary
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            {childrenWithoutProfile.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-medium text-sm">Suggestions</h2>
                <div className="flex flex-wrap gap-2">
                  {childrenWithoutProfile.map((child) => (
                    <Button
                      disabled={isPending}
                      key={child.id}
                      onClick={() => handleCreate(child.id, child.displayName)}
                      variant="outline"
                    >
                      <PlusIcon />
                      Create profile for {child.displayName}
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
