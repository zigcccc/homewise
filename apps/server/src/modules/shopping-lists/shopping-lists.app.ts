import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  completeShoppingListModel,
  createItemModel,
  createSectionModel,
  createShoppingListModel,
  importFromMealPlanModel,
  itemPathParamsModel,
  listShoppingListsQueryParamsModel,
  mealPlanPreviewQueryParamsModel,
  patchItemModel,
  patchSectionModel,
  patchShoppingListModel,
  sectionPathParamsModel,
  shoppingListPathParamsModel,
} from './shopping-lists.model';
import { ShoppingListsService } from './shopping-lists.service';

/**
 * The household's shopping lists. Fully collaborative — anyone can start a list, add to it, and tick
 * things off, which is the whole point when two people are in different aisles.
 *
 * Sections and items are nested under their list rather than addressed on their own: neither means
 * anything outside one, and this way the list id is checked against the household before either is
 * touched. Every mutation returns the whole list, because a single write routinely moves more than
 * the row it names — auto-placing an item can mint a section, deleting one re-homes its items.
 */
const shoppingListsApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listShoppingListsQueryParamsModel), async (c) => {
    const lists = await ShoppingListsService.list(c.var.household.id, c.req.valid('query'));

    return c.json(lists, 200);
  })
  // Before `/:id`, or the router reads "meal-plan-preview" as a list id.
  .get('/meal-plan-preview', zValidator('query', mealPlanPreviewQueryParamsModel), async (c) => {
    const preview = await ShoppingListsService.previewFromMealPlan(c.var.household.id, c.req.valid('query'));

    return c.json(preview, 200);
  })
  .post('/import', zValidator('json', importFromMealPlanModel), async (c) => {
    const { listId } = c.req.valid('json');
    const list = await ShoppingListsService.importFromMealPlan(c.var.household.id, c.req.valid('json'), c.var.user.id);

    // Without a target the import mints a list, and no other client has heard of that id yet.
    c.var.emit({ entity: 'shopping_list', id: list.id, operation: listId === undefined ? 'create' : 'update' });

    return c.json(list, 201);
  })
  .post('/', zValidator('json', createShoppingListModel), async (c) => {
    const list = await ShoppingListsService.create(c.var.household.id, c.req.valid('json'), c.var.user.id);

    c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'create' });

    return c.json(list, 201);
  })
  .get('/:id', zValidator('param', shoppingListPathParamsModel), async (c) => {
    const list = await ShoppingListsService.read(c.var.household.id, c.req.valid('param').id);

    return c.json(list, 200);
  })
  .patch(
    '/:id',
    zValidator('param', shoppingListPathParamsModel),
    zValidator('json', patchShoppingListModel),
    async (c) => {
      const list = await ShoppingListsService.patch(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

      c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

      return c.json(list, 200);
    }
  )
  .delete('/:id', zValidator('param', shoppingListPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await ShoppingListsService.delete(c.var.household.id, id);

    c.var.emit({ entity: 'shopping_list', id, operation: 'delete' });

    return c.json({ success: true }, 202);
  })
  .post(
    '/:id/complete',
    zValidator('param', shoppingListPathParamsModel),
    zValidator('json', completeShoppingListModel),
    async (c) => {
      const result = await ShoppingListsService.complete(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );

      c.var.emit({ entity: 'shopping_list', id: result.list.id, operation: 'update' });

      // Carrying the leftovers mints a second list, which no invalidation of the first would reach.
      if (result.carriedListId !== null) {
        c.var.emit({ entity: 'shopping_list', id: result.carriedListId, operation: 'create' });
      }

      return c.json(result, 200);
    }
  )
  .post('/:id/reopen', zValidator('param', shoppingListPathParamsModel), async (c) => {
    const list = await ShoppingListsService.reopen(c.var.household.id, c.req.valid('param').id);

    c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

    return c.json(list, 200);
  })
  .post(
    '/:id/sections',
    zValidator('param', shoppingListPathParamsModel),
    zValidator('json', createSectionModel),
    async (c) => {
      const list = await ShoppingListsService.createSection(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );

      c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

      return c.json(list, 201);
    }
  )
  .patch(
    '/:id/sections/:sectionId',
    zValidator('param', sectionPathParamsModel),
    zValidator('json', patchSectionModel),
    async (c) => {
      const { id, sectionId } = c.req.valid('param');
      const list = await ShoppingListsService.patchSection(c.var.household.id, id, sectionId, c.req.valid('json'));

      c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

      return c.json(list, 200);
    }
  )
  .delete('/:id/sections/:sectionId', zValidator('param', sectionPathParamsModel), async (c) => {
    const { id, sectionId } = c.req.valid('param');
    const list = await ShoppingListsService.deleteSection(c.var.household.id, id, sectionId);

    c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

    return c.json(list, 200);
  })
  .post(
    '/:id/items',
    zValidator('param', shoppingListPathParamsModel),
    zValidator('json', createItemModel),
    async (c) => {
      const list = await ShoppingListsService.createItem(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json'),
        c.var.user.id
      );

      c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

      return c.json(list, 201);
    }
  )
  .patch(
    '/:id/items/:itemId',
    zValidator('param', itemPathParamsModel),
    zValidator('json', patchItemModel),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const list = await ShoppingListsService.patchItem(
        c.var.household.id,
        id,
        itemId,
        c.req.valid('json'),
        c.var.user.id
      );

      c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

      return c.json(list, 200);
    }
  )
  .delete('/:id/items/:itemId', zValidator('param', itemPathParamsModel), async (c) => {
    const { id, itemId } = c.req.valid('param');
    const list = await ShoppingListsService.deleteItem(c.var.household.id, id, itemId);

    c.var.emit({ entity: 'shopping_list', id: list.id, operation: 'update' });

    return c.json(list, 200);
  });

export default shoppingListsApp;
