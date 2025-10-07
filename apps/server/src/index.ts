import { Hono } from 'hono';
import { logger } from 'hono/logger';
import * as z from 'zod';

import { db, schema } from '@/db';
import { zValidator } from '@/lib/validation';

const app = new Hono();

app.use(logger());

app.get('/', async (c) => {
  try {
    const expenses = await db.select().from(schema.expenses);
    return c.json({ expenses });
  } catch (err) {
    console.log(err);
    return c.json({ error: err });
  }
});

app.post(
  '/expenses',
  zValidator(
    'json',
    z.object({
      name: z.string().trim().min(3, { error: 'Too short' }).max(128, { error: 'Too long' }),
      amount: z.preprocess((val) => (typeof val === 'number' ? val.toFixed(2) : val), z.string()),
    })
  ),
  async (c) => {
    console.log(await c.req.json());
    const data = c.req.valid('json');
    const [expense] = await db.insert(schema.expenses).values(data).returning();
    return c.json({ success: true, expense });
  }
);

export default app;
