import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.HOMEWISE_DATABASE_URL!,
  },
  casing: 'snake_case',
  verbose: process.env.NODE_ENV === 'development',
});
