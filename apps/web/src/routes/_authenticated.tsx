import { setUser } from '@sentry/react';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { Spinner } from '@homewise/ui/core';

import { getSessionQueryOptions } from '@/auth/queries';

export const Route = createFileRoute('/_authenticated')({
  async beforeLoad({ context }) {
    const session = await context.queryClient.ensureQueryData(getSessionQueryOptions());

    if (!session?.data) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }

    // Every authenticated route passes through here, so this is the one place that knows who is
    // using the app. Without it an issue says a bug happened but not to how many people.
    setUser({ id: session.data.user.id, email: session.data.user.email });

    return session.data;
  },
  pendingComponent: () => <Spinner className="min-h-dvh min-w-dvw" />,
});
