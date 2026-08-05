import * as Sentry from '@sentry/react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { API_URL } from '@/api/client';
import { isExpectedRequestFailure } from '@/modules/shared/helpers';

import { routeTree } from './routeTree.gen';

import './main.css';

/**
 * Every request in the app goes through TanStack Query, so this is the one place that sees all of
 * them fail. Expected 4xx responses are left alone — the UI already turns those into field errors
 * and toasts, and reporting them would bury the 5xxs and the dropped connections.
 */
function reportUnexpected(error: unknown) {
  if (!isExpectedRequestFailure(error)) Sentry.captureException(error);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportUnexpected }),
  mutationCache: new MutationCache({ onError: reportUnexpected }),
});

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  // The shell is viewport-height, so the element below is what scrolls — not `window`, which is all the
  // router resets on its own. Without this, arriving at a page after scrolling down a long one lands you
  // in the middle of it.
  scrollToTopSelectors: ['[data-scroll-restoration-id="app-content"]'],
});

// After `createRouter` on purpose: the TanStack integration takes the router instance so pageload
// and navigation transactions are named after matched routes rather than raw URLs.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
  release: import.meta.env.VITE_SENTRY_RELEASE,
  integrations: [
    Sentry.tanstackRouterBrowserTracingIntegration(router),
    // Same as the server: a plain console call prints locally *and* becomes a Sentry log.
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],
  tracesSampleRate: 1.0,
  // Adds the trace headers that let a page load and the API calls it made show up as one trace.
  // The server has to allow them through CORS for this to connect — see `config/cors.ts`.
  tracePropagationTargets: ['localhost', API_URL],
  enableLogs: true,
  // This app shows children's medical information and household contacts. Errors are worth
  // reporting; the payloads that produced them are not.
  //
  // Naming this object opts every category it *doesn't* name into collection, so the two that would
  // otherwise arrive by default are turned off by hand — same as the server's. `urlQueryParams` is
  // the one that actually matters here: `/join-household?token=…` carries a live invite credential
  // in the query string, and Sentry's built-in scrubbing of `token`-ish keys is a safety net, not a
  // reason to send it.
  dataCollection: { httpBodies: [], cookies: false, urlQueryParams: false },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider context={{ queryClient }} router={router} />
    </QueryClientProvider>
  );
}

// Render the app
const rootElement = document.getElementById('root')!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
