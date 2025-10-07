import build from '@hono/vite-build/cloudflare-pages';
import devServer from '@hono/vite-dev-server';
import adapter from '@hono/vite-dev-server/cloudflare';
import dotenv from 'dotenv';
import { defineConfig } from 'vite';
import tsconfigpaths from 'vite-tsconfig-paths';

dotenv.config({ debug: true });

export default defineConfig(async () => {
  return {
    plugins: [tsconfigpaths(), devServer({ adapter, entry: 'src/index.ts' }), build()],
  };
});
