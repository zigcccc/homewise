import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { type CreateExpense } from './models';

export class ExpensesService {
  public static async readAll() {
    // const db = getDb();
    return db.query.expenses.findMany();
  }

  public static async read(id: number) {
    // const db = getDb();
    const expense = await db.query.expenses.findFirst({ where: (expenses, { eq }) => eq(expenses.id, id) });

    if (!expense) {
      throw new HTTPException(404, { message: 'Not found' });
    }

    return expense;
  }

  public static async create(_data: CreateExpense) {
    console.log('[DEBUG] Creating an expense...');
    console.log('[DEBUG] Using DB URL: ', import.meta.env.DATABASE_URL_UNPOOLED);
    const client = neon(import.meta.env.DATABASE_URL_UNPOOLED);
    // const db = drizzle({ client, schema, casing: 'snake_case' });
    // const db = getDb();
    // const [createdExpense] = await db.insert(schema.expenses).values(data).returning();
    console.log('[DEBUG] Using driver: ', client);
    console.log('[DEBUG] Trying to execute simple version query...');
    const versionResult = await client.query('SELECT version();');
    console.log('[DEBUG] Done! Result: ', versionResult);
    console.log('[DEBUG] Trying to execute INSERT query...');
    const result = await client.query("INSERT INTO expenses (name,amount) VALUES ('test', '10.00') RETURNING *");
    console.log('[DEBUG] Done! Result: ', result);

    return result as { id: number; name: string; amount: number }[];
  }

  public static async destroy(id: number) {
    // const db = getDb();
    return db.delete(schema.expenses).where(eq(schema.expenses.id, id)).returning();
  }
}
