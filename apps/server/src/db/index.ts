// // import { Pool } from '@neondatabase/serverless';
// import { neon } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/neon-http';
// // import { Pool } from 'pg';

// import * as schema from '@/db/schema';

// // const Pool = import.meta.env.PROD ? NeonPool : PgPool;
// // const Pool = PgPool;

// // export const pool = new Pool({
// //   connectionString: import.meta.env.HOMEWISE_DATABASE_URL,
// // });

// export const db = drizzle({ client: neon(import.meta.env.HOMEWISE_DATABASE_URL), schema, casing: 'snake_case' });
// export { schema };

// import { Pool as NeonPool } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/node-postgres';
// import { Pool as PgPool } from 'pg';

// import * as schema from '@/db/schema';

// const Pool = import.meta.env.PROD ? NeonPool : PgPool;

// const pool = new Pool({
//   connectionString: import.meta.env.HOMEWISE_DATABASE_URL,
//   max: 10,
//   idleTimeoutMillis: 30000,
// });

// export function getDb() {
//   return drizzle(pool, { schema, casing: 'snake_case' });
// }
// export { schema };

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

const client = neon(import.meta.env.HOMEWISE_DATABASE_URL);
export const db = drizzle({ client, schema, casing: 'snake_case' });
export { schema };
