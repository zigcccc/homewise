import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { createStoreModel, listStoresQueryParamsModel, patchStoreModel, storePathParamsModel } from './stores.model';
import { StoresService } from './stores.service';

/**
 * The shops the household buys at. Fully collaborative — any member can curate them, the same way
 * they can the ingredient library these hang off.
 */
const storesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listStoresQueryParamsModel), async (c) => {
    const stores = await StoresService.list(c.var.household.id, c.req.valid('query'));

    return c.json(stores, 200);
  })
  .post('/', zValidator('json', createStoreModel), async (c) => {
    const store = await StoresService.create(c.var.household.id, c.req.valid('json'));

    c.var.emit({ entity: 'store', id: store.id, operation: 'create', label: store.name });

    return c.json(store, 201);
  })
  .patch('/:id', zValidator('param', storePathParamsModel), zValidator('json', patchStoreModel), async (c) => {
    const { data: store, changeset } = await StoresService.patch(
      c.var.household.id,
      c.req.valid('param').id,
      c.req.valid('json')
    );

    c.var.emit({ entity: 'store', id: store.id, operation: 'update', label: store.name, changes: changeset });

    return c.json(store, 200);
  })
  .delete('/:id', zValidator('param', storePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await StoresService.delete(c.var.household.id, id);

    // Ingredients lost a default and list sections were tombstoned. Unlogged: this deletion's wake.
    c.var.emit(
      { entity: 'store', id, operation: 'delete', label: deleted.name },
      { entity: 'ingredient', id: null, operation: 'update', label: null },
      { entity: 'shopping_list', id: null, operation: 'update', label: null }
    );

    return c.json({ success: true }, 202);
  });

export default storesApp;
