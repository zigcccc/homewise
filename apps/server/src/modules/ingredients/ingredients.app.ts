import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { IngredientsService } from './ingredients.service';
import {
  createIngredientModel,
  ingredientPathParamsModel,
  listIngredientsQueryParamsModel,
  patchIngredientModel,
} from './models';

/**
 * The household's reusable ingredient library. Recipes attach these rows; shopping lists will too.
 * Fully collaborative — any member can curate the vocabulary.
 */
const ingredientsApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listIngredientsQueryParamsModel), async (c) => {
    const ingredients = await IngredientsService.list(c.var.household.id, c.req.valid('query'));

    return c.json(ingredients, 200);
  })
  .post('/', zValidator('json', createIngredientModel), async (c) => {
    const payload = c.req.valid('json');
    const ingredient = await IngredientsService.create(c.var.household.id, payload);

    c.var.emit({ entity: 'ingredient', id: ingredient.id, operation: 'create' });

    // A named shop is found-or-created by the same write, so the shop list may have grown too.
    if (payload.storeName !== undefined) {
      c.var.emit({ entity: 'store', id: ingredient.storeId, operation: 'create' });
    }

    return c.json(ingredient, 201);
  })
  .patch(
    '/:id',
    zValidator('param', ingredientPathParamsModel),
    zValidator('json', patchIngredientModel),
    async (c) => {
      const payload = c.req.valid('json');
      const ingredient = await IngredientsService.patch(c.var.household.id, c.req.valid('param').id, payload);

      // An all-undefined patch is a genuine no-op, but announcing it anyway costs one refetch and
      // keeps the handler from having to diff. Invalidation is idempotent.
      c.var.emit({ entity: 'ingredient', id: ingredient.id, operation: 'update' });

      // A named shop is found-or-created by the same write, so the shop list may have grown too.
      if (payload.storeName !== undefined) {
        c.var.emit({ entity: 'store', id: ingredient.storeId, operation: 'create' });
      }

      return c.json(ingredient, 200);
    }
  )
  .delete('/:id', zValidator('param', ingredientPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await IngredientsService.delete(c.var.household.id, id);

    c.var.emit({ entity: 'ingredient', id, operation: 'delete' });

    return c.json({ success: true }, 202);
  });

export default ingredientsApp;
