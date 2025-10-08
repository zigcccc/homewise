import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, schema } from '@/db';

import { type CreateExpense } from './expenses.models';

export class ExpensesService {
  public static async readAll() {
    return db.query.expenses.findMany();
  }

  public static async read(id: number) {
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

  public static async delete(id: number) {
    return db.delete(schema.expenses).where(eq(schema.expenses.id, id));
  }
}
