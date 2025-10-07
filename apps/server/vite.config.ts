import build from '@hono/vite-build/vercel';
import devServer from '@hono/vite-dev-server';
import dotenv from 'dotenv';
import { defineConfig } from 'vite';
import tsconfigpaths from 'vite-tsconfig-paths';

dotenv.config({ debug: true });

export default defineConfig(async () => {
  return {
    plugins: [tsconfigpaths(), devServer({ entry: 'src/index.ts' }), build()],
  };
});
