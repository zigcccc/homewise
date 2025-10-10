import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';

import { env } from '@/config/env';
import * as schema from '@/db/schema';

const Pool = env.NODE_ENV === 'production' ? NeonPool : (PgPool as unknown as typeof NeonPool);

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema, casing: 'snake_case' });

export { schema, db };
