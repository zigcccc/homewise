import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

import { SidebarProvider } from '@homewise/ui/core';

function RootLayout() {
  const { queryClient } = Route.useRouteContext();

  return (
    <>
      <HeadContent />
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          classNames: {
            // Sonner fills the action button with the toast's *text* colour, which on a rich-colors
            // success toast is a near-black pill sitting in a pale green box. Ghost it instead.
            // `!` because sonner's `[data-sonner-toast][data-styled='true'] [data-button]` outranks
            // a single utility class three selectors to one.
            actionButton: '!border !border-current/25 !bg-transparent !text-current hover:!bg-current/10',
          },
        }}
      />
      {/* The app is a shell, not a document: it ends at the viewport and the scrolling happens inside
          it (see `_onboarded`). Without a bounded ancestor the wrapper's own `min-h-svh` lets the page
          grow, and every route is then stuck with the one scrollbar the document gives it. The inset's
          `m-2` margins come out of this height on their own — a stretched flex item's height is the
          line's cross size minus its margins. */}
      <SidebarProvider className="h-svh overflow-hidden">
        <Outlet />
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
  notFoundComponent() {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    );
  },
});
