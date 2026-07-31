import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Only the deployed builds upload source maps. Locally and under the E2E suite there's no token, so
// the plugin is left out entirely rather than left to warn on every build.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  build: {
    // 'hidden' still emits the maps for Sentry to consume, but drops the `//# sourceMappingURL`
    // comment — without it a plain `sourcemap: true` publishes our source to anyone who opens
    // devtools on the deployed app. The plugin deletes the files after uploading them anyway; this
    // covers the window where they exist.
    sourcemap: uploadSourceMaps ? 'hidden' : true,
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
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: process.env.VITE_SENTRY_RELEASE },
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
});
