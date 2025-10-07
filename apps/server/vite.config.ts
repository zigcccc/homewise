import build from '@hono/vite-build/vercel';
import devServer from '@hono/vite-dev-server';
import { defineConfig, loadEnv } from 'vite';
import tsconfigpaths from 'vite-tsconfig-paths';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['HOMEWISE_']);

  return {
    envPrefix: 'HOMEWISE_',
    plugins: [tsconfigpaths(), devServer({ env, entry: 'src/index.ts' }), build()],
  };
});
