import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createRecipeModel,
  listRecipesQueryParamsModel,
  patchRecipeModel,
  recipePathParamsModel,
  recipeTagPathParamsModel,
} from './recipes.model';
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
    const { tagId } = c.req.valid('param');
    await RecipesService.deleteTag(c.var.household.id, tagId);

    c.var.emit({ entity: 'recipe_tag', id: tagId, operation: 'delete', label: null });

    return c.json({ success: true }, 202);
  })
  .get('/', zValidator('query', listRecipesQueryParamsModel), async (c) => {
    const recipes = await RecipesService.list(c.var.household.id, c.req.valid('query'));

    return c.json(recipes, 200);
  })
  .post('/', zValidator('json', createRecipeModel), async (c) => {
    const { household, user } = c.var;
    const recipe = await RecipesService.create(household.id, c.req.valid('json'), user.id);

    // Saving a recipe is also when the names on it get minted into the ingredient library, so the
    // library changed too even though nobody asked for an ingredient — and for that reason it is not
    // its own line in the feed.
    c.var.emit(
      { entity: 'recipe', id: recipe.id, operation: 'create', label: recipe.title },
      { entity: 'ingredient', id: null, operation: 'update', label: null }
    );

    return c.json(recipe, 201);
  })
  .get('/:id', zValidator('param', recipePathParamsModel), async (c) => {
    const recipe = await RecipesService.read(c.var.household.id, c.req.valid('param').id);

    return c.json(recipe, 200);
  })
  .patch('/:id', zValidator('param', recipePathParamsModel), zValidator('json', patchRecipeModel), async (c) => {
    const { changedFields, ...recipe } = await RecipesService.patch(
      c.var.household.id,
      c.req.valid('param').id,
      c.req.valid('json')
    );

    c.var.emit(
      { entity: 'recipe', id: recipe.id, operation: 'update', label: recipe.title, changes: changedFields },
      { entity: 'ingredient', id: null, operation: 'update', label: null }
    );

    return c.json(recipe, 200);
  })
  .delete('/:id', zValidator('param', recipePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await RecipesService.delete(c.var.household.id, id);

    // Any meal plan that referenced it just had the title tombstoned onto it, so those cards changed
    // too — and the plan's cache is keyed by date range, which no recipe id can address. Unlogged:
    // nobody edited the plan, the recipe under it went.
    c.var.emit(
      { entity: 'recipe', id, operation: 'delete', label: deleted.title },
      { entity: 'meal_plan', id: null, operation: 'update', label: null }
    );

    return c.json({ success: true }, 202);
  });

export default recipesApp;
