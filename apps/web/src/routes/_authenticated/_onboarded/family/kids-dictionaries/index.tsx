import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BabyIcon, BookHeartIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
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
import { listChildDictionariesQueryOptions } from '@/modules/child-dictionaries';
import { getMyHouseholdQueryOptions } from '@/modules/households';

import { Actionbar } from '../../../-components/Actionbar';

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids-dictionaries/')({
  async loader({ context }) {
    await Promise.all([
      context.queryClient.ensureQueryData(listChildDictionariesQueryOptions()),
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
    ]);
  },
  component: KidsDictionariesRoute,
  pendingComponent: () => <Spinner />,
});

function KidsDictionariesRoute() {
  const navigate = Route.useNavigate();
  const { queryClient } = Route.useRouteContext();
  const { data: dictionaries } = useSuspenseQuery(listChildDictionariesQueryOptions());
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const { mutateAsync: createDictionary, isPending } = useMutation({
    mutationFn: async (memberId: number) => parseResponse(client['child-dictionaries'].$post({ json: { memberId } })),
  });

  // Children are eligible for a dictionary until they have one.
  const childrenWithoutDictionary = household.members.filter(
    (member) => member.role === 'child' && !dictionaries.some((dictionary) => dictionary.memberId === member.id)
  );

  const handleCreate = async (memberId: number, displayName: string) => {
    try {
      const dictionary = await createDictionary(memberId);

      // Navigate before invalidating: refetching first re-renders this list (dropping the suggestion
      // button that was just clicked) while we're still on the page.
      toast.success(`Dictionary created for ${displayName}.`);
      await navigate({
        to: '/family/kids-dictionaries/$dictionaryId',
        params: { dictionaryId: dictionary.id.toString() },
      });
      void queryClient.invalidateQueries({ queryKey: ['child-dictionaries', 'list'], exact: true });
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
              <BreadcrumbPage>Kids dictionaries</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div>
          <h1 className="font-medium text-lg">Kids dictionaries</h1>
          <p className="text-muted-foreground text-sm">
            Keep the words your kids invent before you forget them — "nana" for banana, and everything else.
          </p>
        </div>

        {dictionaries.length === 0 && childrenWithoutDictionary.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BabyIcon />
              </EmptyMedia>
              <EmptyTitle>No children in this household yet</EmptyTitle>
              <EmptyDescription>
                Dictionaries are created for household members with the "child" role. Add one to get started.
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
            {dictionaries.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dictionaries.map((dictionary) => (
                  <Link
                    key={dictionary.id}
                    params={{ dictionaryId: dictionary.id.toString() }}
                    to="/family/kids-dictionaries/$dictionaryId"
                  >
                    <Card className="h-full transition-colors hover:border-primary/50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BookHeartIcon className="size-4 text-muted-foreground" />
                          {dictionary.child.displayName}
                        </CardTitle>
                        <CardDescription>
                          {dictionary.entryCount} {dictionary.entryCount === 1 ? 'word' : 'words'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-muted-foreground text-sm">
                        {dictionary.entryCount === 0 ? 'No words yet — add the first one.' : 'View dictionary'}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {childrenWithoutDictionary.length > 0 && (
              <div className="space-y-2">
                <h2 className="font-medium text-sm">Suggestions</h2>
                <div className="flex flex-wrap gap-2">
                  {childrenWithoutDictionary.map((child) => (
                    <Button
                      disabled={isPending}
                      key={child.id}
                      onClick={() => handleCreate(child.id, child.displayName)}
                      variant="outline"
                    >
                      <PlusIcon />
                      Create dictionary for {child.displayName}
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
