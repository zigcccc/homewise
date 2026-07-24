import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Migration tooling is a separate context from the running app: it only needs a
// database connection, not the full app env contract (auth secret, Resend key,
// …). Importing `@/config/env` here would hard-fail migrate whenever those
// unrelated vars are absent — e.g. preview builds, where Neon injects only
// DATABASE_URL. Read the one var we actually need directly instead.
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit');
}

export default defineConfig({
  schema: './src/db/schema',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  casing: 'snake_case',
  verbose: process.env.NODE_ENV === 'development',
});
