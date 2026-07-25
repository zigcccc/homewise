import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import {
  createRecipeModel,
  listRecipesQueryParamsModel,
  patchRecipeModel,
  recipePathParamsModel,
  recipeTagPathParamsModel,
} from './models';
import { RecipesService } from './recipes.service';

/**
 * Household recipes. Fully collaborative.
 *
 * `/tags` is registered before `/:id` on purpose — Hono matches in registration order, and `:id`
 * coerces to a number, so a later `/tags` would be swallowed and 400 instead of resolving.
 */
const recipesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/tags', async (c) => {
    const tags = await RecipesService.listTags(c.var.household.id);

    return c.json(tags, 200);
  })
  .delete('/tags/:tagId', zValidator('param', recipeTagPathParamsModel), async (c) => {
    await RecipesService.deleteTag(c.var.household.id, c.req.valid('param').tagId);

    return c.json({ success: true }, 202);
  })
  .get('/', zValidator('query', listRecipesQueryParamsModel), async (c) => {
    const recipes = await RecipesService.list(c.var.household.id, c.req.valid('query'));

    return c.json(recipes, 200);
  })
  .post('/', zValidator('json', createRecipeModel), async (c) => {
    const { household, user } = c.var;
    const recipe = await RecipesService.create(household.id, c.req.valid('json'), user.id);

    return c.json(recipe, 201);
  })
  .get('/:id', zValidator('param', recipePathParamsModel), async (c) => {
    const recipe = await RecipesService.read(c.var.household.id, c.req.valid('param').id);

    return c.json(recipe, 200);
  })
  .patch('/:id', zValidator('param', recipePathParamsModel), zValidator('json', patchRecipeModel), async (c) => {
    const recipe = await RecipesService.patch(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

    return c.json(recipe, 200);
  })
  .delete('/:id', zValidator('param', recipePathParamsModel), async (c) => {
    await RecipesService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

export default recipesApp;
