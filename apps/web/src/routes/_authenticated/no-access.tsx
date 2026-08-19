import { setTag, setUser } from '@sentry/react';
import { createFileRoute, useNavigate, useRouteContext } from '@tanstack/react-router';
import { BanIcon } from 'lucide-react';

import { Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homewise/ui/core';

import { authClient } from '@/auth/client';

export const Route = createFileRoute('/_authenticated/no-access')({
  component: NoAccessRoute,
});

/**
 * Where an account that belongs to a household but may not read any of it lands.
 *
 * Only reachable for a member whose role grants nothing — a pet that holds an account, from before
 * pets were barred from being invited. It exists so that case shows a dead end instead of being sent
 * through onboarding, where it would create a second household.
 */
function NoAccessRoute() {
  const { queryClient } = useRouteContext({ from: '/_authenticated/no-access' });
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient?.clear();
    setUser(null);
    setTag('householdId', undefined);
    navigate({ to: '/login', search: { redirect: window.location.href } });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BanIcon />
          </EmptyMedia>
          <EmptyTitle>This account can't open a household</EmptyTitle>
          <EmptyDescription>
            Ask whoever owns the household to check what this account is set up as, then sign in again.
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={handleSignOut} variant="outline">
          Sign out
        </Button>
      </Empty>
    </main>
  );
}
