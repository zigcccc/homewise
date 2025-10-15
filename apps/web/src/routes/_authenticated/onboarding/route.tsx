import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const { user } = Route.useRouteContext();
  const match = useMatchRoute();

  const isCreateHouseholdRoute = match({ to: '/onboarding/create-household' });
  const subtitle = isCreateHouseholdRoute ? "Let's get you started!" : 'Invite your household members.';

  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <div className="flex w-[480px] max-w-screen flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-foreground text-2xl font-medium">Hello {user.name} 👋</span>
          <span className="text-foreground text-lg font-light">{subtitle}</span>
        </div>
        <Outlet />
      </div>
    </main>
  );
}
