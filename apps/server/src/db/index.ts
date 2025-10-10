import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from '@/db/schema';

// const Pool = import.meta.env.PROD ? NeonPool : PgPool;

// export const pool = new Pool({
//   connectionString: import.meta.env.DATABASE_URL,
//   max: 10,
//   idleTimeoutMillis: 30000,
//   ssl: import.meta.env.PROD ? { rejectUnauthorized: false } : undefined,
// });

const client = neon(import.meta.env.DATABASE_URL);
export const db = drizzle({ client, schema, casing: 'snake_case' });
export { schema };
