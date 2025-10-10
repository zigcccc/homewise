import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '@/db/schema';

// const Pool = import.meta.env.PROD ? NeonPool : PgPool;

// export const pool = new Pool({
//   connectionString: import.meta.env.DATABASE_URL,
//   max: 10,
//   idleTimeoutMillis: 30000,
//   ssl: import.meta.env.PROD ? { rejectUnauthorized: false } : undefined,
// });

const pool = new Pool({ connectionString: import.meta.env.DATABASE_URL, log: console.log, max: 20, keepAlive: false });
export const db = drizzle(pool, { schema, casing: 'snake_case' });
export { schema };
