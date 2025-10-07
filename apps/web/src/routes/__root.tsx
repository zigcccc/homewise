import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

function RootLayout() {
  const { queryClient } = Route.useRouteContext();

  return (
    <>
      <HeadContent />
      <Toaster position="top-center" richColors />
      <Outlet />
      <Suspense fallback={null}>
        <ReactQueryDevtools client={queryClient} />
        <TanStackRouterDevtools />
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
