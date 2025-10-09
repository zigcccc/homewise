import build from '@hono/vite-build/vercel';
import devServer from '@hono/vite-dev-server';
import { defineConfig, loadEnv } from 'vite';
import tsconfigpaths from 'vite-tsconfig-paths';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['HOMEWISE_', 'BETTER_AUTH_']);

  return {
    server: {
      cors: false,
    },
    envPrefix: ['HOMEWISE_', 'BETTER_AUTH_'],
    plugins: [
      tsconfigpaths(),
      devServer({ env, entry: 'src/index.ts' }),
      build({ vercel: { function: { runtime: 'nodejs22.x' } } }),
    ],
  };
});
