import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Only the deployed builds upload source maps. Locally and under the E2E suite there's no token, so
  // the plugin is left out entirely rather than left to warn on every build.
  const uploadSourceMaps = !!env.SENTRY_AUTH_TOKEN;

  return {
    build: {
      // 'hidden' still emits the maps for Sentry to consume, but drops the `//# sourceMappingURL`
      // comment — without it a plain `sourcemap: true` publishes our source to anyone who opens
      // devtools on the deployed app. The plugin deletes the files after uploading them anyway; this
      // covers the window where they exist.
      //
      // The third case is a deployed build with no token: nothing would upload them and nothing would
      // delete them, so emitting any at all only leaves our source sitting in a public `dist`. Off.
      // `vercel-build.sh` refuses that build outright — this is the belt to its braces, so the leak
      // can't come back through some other caller.
      sourcemap: uploadSourceMaps ? 'hidden' : !env.VERCEL,
    },
    plugins: [
      // Must stay first — it generates the route tree the rest of the build compiles.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      // Last: it works on the finished bundle.
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              release: { name: env.VITE_SENTRY_RELEASE },
              sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            }),
          ]
        : []),
    ],
    server: { port: 3000 },
    // Same port for `vite preview` (the built app) — the e2e suite serves the
    // production build this way locally, which handles concurrent load far better
    // than the dev server.
    preview: { port: 3000, strictPort: true },
    resolve: {
      tsconfigPaths: true,
    },
  };
});
