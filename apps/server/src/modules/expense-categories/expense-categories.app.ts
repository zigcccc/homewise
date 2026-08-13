import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createExpenseCategoryModel,
  expenseCategoryPathParamsModel,
  listExpenseCategoriesQueryParamsModel,
  patchExpenseCategoryModel,
} from './expense-categories.model';
import { ExpenseCategoriesService } from './expense-categories.service';

/**
 * The labels a household files its spending under. Fully collaborative — any member can curate them,
 * the same way they can the shops the ingredient library hangs off.
 */
const expenseCategoriesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listExpenseCategoriesQueryParamsModel), async (c) => {
    const categories = await ExpenseCategoriesService.list(c.var.household.id, c.req.valid('query'));

    return c.json(categories, 200);
  })
  .post('/', zValidator('json', createExpenseCategoryModel), async (c) => {
    const category = await ExpenseCategoriesService.create(c.var.household.id, c.req.valid('json'));

    c.var.emit({ entity: 'expense_category', id: category.id, operation: 'create', label: null });

    return c.json(category, 201);
  })
  .patch(
    '/:id',
    zValidator('param', expenseCategoryPathParamsModel),
    zValidator('json', patchExpenseCategoryModel),
    async (c) => {
      const category = await ExpenseCategoriesService.patch(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );

      c.var.emit({ entity: 'expense_category', id: category.id, operation: 'update', label: null });

      return c.json(category, 200);
    }
  )
  .delete('/:id', zValidator('param', expenseCategoryPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await ExpenseCategoriesService.delete(c.var.household.id, id);

    // Also an expense change — every row filed here just became uncategorised, and the table shows
    // the category's name off the join.
    c.var.emit(
      { entity: 'expense_category', id, operation: 'delete', label: null },
      { entity: 'expense', id: null, operation: 'update', label: null }
    );

    return c.json({ success: true }, 202);
  });

export default expenseCategoriesApp;
