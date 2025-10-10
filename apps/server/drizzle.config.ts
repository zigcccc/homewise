import { defineConfig } from 'drizzle-kit';

import { env } from '@/config/env';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL!,
  },
  casing: 'snake_case',
  verbose: env.NODE_ENV === 'development',
});
