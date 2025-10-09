// import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool as PgPool } from 'pg';

import * as schema from '@/db/schema';

// const Pool = import.meta.env.PROD ? NeonPool : PgPool;
const Pool = PgPool;

export const pool = new Pool({
  connectionString: import.meta.env.HOMEWISE_DATABASE_URL,
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });
export { schema };
