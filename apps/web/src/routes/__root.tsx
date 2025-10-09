import { SidebarInset, SidebarProvider } from '@homewise/ui/core/sidebar';
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

import { authClient } from '@/auth/client';

import { AppSidebar } from './-components/AppSidebar';

function RootLayout() {
  const { queryClient } = Route.useRouteContext();
  const { data } = authClient.useSession();

  return (
    <>
      <HeadContent />
      <Toaster position="top-center" richColors />
      <SidebarProvider>
        {data?.session && <AppSidebar />}
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      <Suspense fallback={null}>
        <ReactQueryDevtools client={queryClient} />
        <TanStackRouterDevtools />
        {import.meta.env.PROD && <SpeedInsights />}
        {import.meta.env.PROD && <Analytics />}
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
