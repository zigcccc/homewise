import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { type AppContext } from '@/types/app.type';

import { ExpensesService } from './expenses.service';
import { createExpenseModel, readExpensePathParamsModel } from './models';

const expnensesApp = new Hono<AppContext>()
  .get('/', async (c) => {
    const data = await ExpensesService.readAll();
    return c.json({ data });
  })
  .get('/:id', zValidator('param', readExpensePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const expense = await ExpensesService.read(id);
    return c.json(expense);
  })
  .post('/', zValidator('json', createExpenseModel), async (c) => {
    const expense = await ExpensesService.create(c.req.valid('json'));
    return c.json({ success: true, expense }, 201);
  })
  .delete('/:id', zValidator('param', readExpensePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await ExpensesService.destroy(id);
    return c.json({ success: true });
  });

export default expnensesApp;
