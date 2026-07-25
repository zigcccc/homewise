import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: { port: 3000 },
  // Same port for `vite preview` (the built app) — the e2e suite serves the
  // production build this way locally, which handles concurrent load far better
  // than the dev server.
  preview: { port: 3000, strictPort: true },
  resolve: {
    tsconfigPaths: true,
  },
});
