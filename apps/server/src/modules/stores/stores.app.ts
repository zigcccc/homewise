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

    c.var.emit({ entity: 'store', id: store.id, operation: 'create' });

    return c.json(store, 201);
  })
  .patch('/:id', zValidator('param', storePathParamsModel), zValidator('json', patchStoreModel), async (c) => {
    const store = await StoresService.patch(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

    c.var.emit({ entity: 'store', id: store.id, operation: 'update' });

    return c.json(store, 200);
  })
  .delete('/:id', zValidator('param', storePathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await StoresService.delete(c.var.household.id, id);

    // Also an ingredient change — every row that defaulted to this shop just lost that default — and
    // a shopping-list one, since the sections that stood for it were tombstoned with its name.
    c.var.emit(
      { entity: 'store', id, operation: 'delete' },
      { entity: 'ingredient', id: null, operation: 'update' },
      { entity: 'shopping_list', id: null, operation: 'update' }
    );

    return c.json({ success: true }, 202);
  });

export default storesApp;
