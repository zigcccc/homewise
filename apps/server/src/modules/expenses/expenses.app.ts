import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createExpenseModel,
  expensePathParamsModel,
  expensesSummaryQueryParamsModel,
  listExpensesQueryParamsModel,
  patchExpenseModel,
} from './expenses.model';
import { ExpensesService } from './expenses.service';

/**
 * What the household spends. Fully collaborative — anyone who lives here can log, correct or remove
 * an expense, because a shared ledger nobody but its author can fix is a ledger that stays wrong.
 *
 * There is no `GET /:id`: the table shows every field an expense has, so a detail view would repeat
 * it. `/summary` is still registered before any `:id` route would be — Hono matches in registration
 * order, and a later literal path is swallowed by an earlier parameter.
 */
const expensesApp = new Hono<AppContext>()
  .use(withHousehold('expenses'))
  .get('/', zValidator('query', listExpensesQueryParamsModel), async (c) => {
    const expenses = await ExpensesService.list(c.var.household.id, c.req.valid('query'));

    return c.json(expenses, 200);
  })
  .get('/summary', zValidator('query', expensesSummaryQueryParamsModel), async (c) => {
    const summary = await ExpensesService.summary(c.var.household.id, c.req.valid('query'));

    return c.json(summary, 200);
  })
  .post('/', zValidator('json', createExpenseModel), async (c) => {
    const payload = c.req.valid('json');
    const expense = await ExpensesService.create(c.var.household.id, payload);

    c.var.emit({ entity: 'expense', id: expense.id, operation: 'create', label: expense.title });

    // A named category is found-or-created here. Unlogged: it is part of logging the expense.
    if (payload.categoryName !== undefined) {
      c.var.emit({ entity: 'expense_category', id: expense.categoryId, operation: 'create', label: null });
    }

    return c.json(expense, 201);
  })
  .patch('/:id', zValidator('param', expensePathParamsModel), zValidator('json', patchExpenseModel), async (c) => {
    const payload = c.req.valid('json');
    const { data: expense, changeset } = await ExpensesService.patch(
      c.var.household.id,
      c.req.valid('param').id,
      payload
    );

    c.var.emit({
      entity: 'expense',
      id: expense.id,
      operation: 'update',
      label: expense.title,
      changes: changeset,
    });

    if (payload.categoryName !== undefined) {
      c.var.emit({ entity: 'expense_category', id: expense.categoryId, operation: 'create', label: null });
    }

    return c.json(expense, 200);
  })
  .delete('/:id', zValidator('param', expensePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await ExpensesService.delete(c.var.household.id, id);

    c.var.emit({ entity: 'expense', id, operation: 'delete', label: deleted.title });

    return c.json({ success: true }, 202);
  });

export default expensesApp;
