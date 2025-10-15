import { Button } from '@homewise/ui/core/button';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import z from 'zod';

import { client } from '@/api/client';
import { getReadHouseholdInviteQueryOptions } from '@/modules/households';

export const Route = createFileRoute('/_authenticated/join-household')({
  validateSearch: z.object({ token: z.string() }),
  beforeLoad({ context, search }) {
    return { ...context, token: search.token };
  },
  async loader({ context }) {
    await context.queryClient.ensureQueryData(getReadHouseholdInviteQueryOptions(context.token));
  },
  component: JoinHouseholdRoute,
});

function JoinHouseholdRoute() {
  const navigate = Route.useNavigate();
  const { user, queryClient } = Route.useRouteContext();
  const { token } = Route.useSearch();
  const { data: householdInvite } = useSuspenseQuery(getReadHouseholdInviteQueryOptions(token));
  const { mutateAsync: acceptAsync, isPending: isAccepting } = useMutation({
    mutationFn: async () =>
      client.households.invite[':id'].accept.$post({ param: { id: householdInvite.id.toString() }, query: { token } }),
  });

  const handleAcceptInvite = async () => {
    try {
      await acceptAsync();
      await queryClient.refetchQueries({ queryKey: ['households', 'my'] });
      navigate({ to: '/' });
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <div className="flex w-[480px] max-w-screen flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-foreground text-2xl font-medium">Hello {user.name} 👋</span>
          <span className="text-foreground text-lg font-light">
            Ready to join the "{householdInvite.household.name}" household?
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          To join {householdInvite.household.owner.name} and the rest of the crew & get started, click on the button
          bellow
        </p>
        <div className="flex flex-col gap-2">
          <Button loading={isAccepting} onClick={handleAcceptInvite}>
            Accept invite
          </Button>
          <Button variant="ghost">Reject</Button>
        </div>
      </div>
    </main>
  );
}
