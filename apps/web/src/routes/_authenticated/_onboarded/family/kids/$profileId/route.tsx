import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import { MoreHorizontal, TrashIcon } from 'lucide-react';
import { useState } from 'react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { getChildProfileQueryOptions, invalidateChildProfile } from '@/modules/child-profiles';
import { Actionbar, ConfirmDeleteDialog } from '@/modules/shared';

export const Route = createFileRoute('/_authenticated/_onboarded/family/kids/$profileId')({
  async loader({ context, params }) {
    await context.queryClient.ensureQueryData(getChildProfileQueryOptions(Number(params.profileId)));
  },
  component: ProfileLayout,
  pendingComponent: () => <Spinner />,
});

function ProfileLayout() {
  const { profileId } = Route.useParams();
  const navigate = Route.useNavigate();
  const matchRoute = useMatchRoute();
  const id = Number(profileId);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useSuspenseQuery(getChildProfileQueryOptions(id));

  const { mutateAsync: deleteProfile } = useMutation({
    mutationFn: async () => parseResponse(client['child-profiles'][':id'].$delete({ param: { id: id.toString() } })),
  });

  const handleDeleteProfile = async () => {
    try {
      await deleteProfile();
      toast.success(`${profile.child.displayName}'s profile deleted.`);
      await navigate({ to: '/family/kids' });
      // After navigating away, so the removed profile's detail query can't refetch into a 404.
      invalidateChildProfile(queryClient, id);
    } catch {
      toast.error('Something went wrong.');
    }
  };

  // The tabs are real routes; the active one is whichever child is matched.
  const activeTab = matchRoute({ to: '/family/kids/$profileId/dictionary', params: { profileId } })
    ? 'dictionary'
    : 'general';

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
              <BreadcrumbLink asChild>
                <Link to="/family/kids">Kids</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{profile.child.displayName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage alt={profile.child.displayName} src={profile.profilePicture || undefined} />
              <AvatarFallback>{profile.child.displayName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-medium text-lg">{profile.child.displayName}</h1>
              <p className="text-muted-foreground text-sm">Child profile</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 w-9 p-0" variant="outline">
                <span className="sr-only">Profile actions</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                <TrashIcon />
                Delete profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tabs value={activeTab}>
          <TabsList>
            <TabsTrigger asChild value="general">
              <Link params={{ profileId }} to="/family/kids/$profileId/general">
                General
              </Link>
            </TabsTrigger>
            <TabsTrigger asChild value="dictionary">
              <Link params={{ profileId }} to="/family/kids/$profileId/dictionary">
                Dictionary
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Outlet />

        <ConfirmDeleteDialog
          confirmLabel="Delete profile"
          description={
            <>
              {profile.child.displayName}'s profile — including their dictionary and everything in it — will be
              permanently deleted. This can't be undone.
            </>
          }
          onConfirm={handleDeleteProfile}
          onOpenChange={setDeleteOpen}
          open={deleteOpen}
          title={`Delete ${profile.child.displayName}'s profile?`}
        />
      </main>
    </>
  );
}
