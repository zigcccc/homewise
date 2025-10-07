import { lazy } from 'react';

export const QueryDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : lazy(() =>
        import('@tanstack/react-query-devtools/build/modern/production.js').then((d) => ({
          default: d.ReactQueryDevtools,
        }))
      );
