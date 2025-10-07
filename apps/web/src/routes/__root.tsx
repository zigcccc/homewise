import { type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

import { QueryDevtools, RouterDevtools } from '@/components/devtools';

function RootLayout() {
  const { queryClient } = Route.useRouteContext();

  return (
    <>
      <HeadContent />
      <Toaster position="top-center" richColors />
      <Outlet />
      <Suspense fallback={null}>
        <QueryDevtools client={queryClient} />
        <RouterDevtools />
      </Suspense>
    </>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayout,
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    );
  },
});
