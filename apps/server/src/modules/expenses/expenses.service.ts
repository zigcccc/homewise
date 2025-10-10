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

  public static async create(data: CreateExpense) {
    const [createdExpense] = await db.insert(schema.expenses).values(data).returning();

    return createdExpense;
  }

  public static async destroy(id: number) {
    // const db = getDb();
    return db.delete(schema.expenses).where(eq(schema.expenses.id, id)).returning();
  }
}
