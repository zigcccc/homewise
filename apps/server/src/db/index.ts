import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool as PgPool } from 'pg';

import * as schema from '@/db/schema';

const Pool = process.env.NODE_ENV === 'production' ? NeonPool : PgPool;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });
export { schema };
