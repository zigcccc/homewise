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
    const ingredient = await IngredientsService.create(c.var.household.id, c.req.valid('json'));

    return c.json(ingredient, 201);
  })
  .patch(
    '/:id',
    zValidator('param', ingredientPathParamsModel),
    zValidator('json', patchIngredientModel),
    async (c) => {
      const ingredient = await IngredientsService.patch(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );

      return c.json(ingredient, 200);
    }
  )
  .delete('/:id', zValidator('param', ingredientPathParamsModel), async (c) => {
    await IngredientsService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

export default ingredientsApp;
