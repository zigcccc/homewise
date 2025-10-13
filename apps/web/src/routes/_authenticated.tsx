import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoaderCircleIcon } from 'lucide-react';

import { getSessionQueryOptions } from '@/auth/queries';

export const Route = createFileRoute('/_authenticated')({
  async beforeLoad({ context }) {
    const session = await context.queryClient.ensureQueryData(getSessionQueryOptions());

    if (!session?.data) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return session.data;
  },
  pendingComponent() {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <LoaderCircleIcon className="animate-spin" />
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  },
});
