import { createFileRoute, redirect } from '@tanstack/react-router';

import { Button } from '@homewise/ui/core/button';

import { getMyHouseholdQueryOptions } from '@/modules/households';
import { AddMemberTabs } from '@/modules/households/components';

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

  const goToDashboard = () => navigate({ to: '/' });

  return (
    <div className="space-y-4">
      <AddMemberTabs onInvited={goToDashboard} />
      <Button className="w-full" onClick={goToDashboard} type="button" variant="outline">
        Skip for now
      </Button>
    </div>
  );
}
