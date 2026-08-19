import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createStorageLocationModel,
  listStorageLocationsQueryParamsModel,
  patchStorageLocationModel,
  storageLocationPathParamsModel,
} from './storage-locations.model';
import { StorageLocationsService } from './storage-locations.service';

/**
 * The places the household keeps things. Fully collaborative — anyone who can put something in the
 * garage can say the garage exists.
 */
const storageLocationsApp = new Hono<AppContext>()
  .use(withHousehold('storageLocations'))
  .get('/', zValidator('query', listStorageLocationsQueryParamsModel), async (c) => {
    const locations = await StorageLocationsService.list(c.var.household.id, c.req.valid('query'));

    return c.json(locations, 200);
  })
  .post('/', zValidator('json', createStorageLocationModel), async (c) => {
    const location = await StorageLocationsService.create(c.var.household.id, c.req.valid('json'));

    c.var.emit({ entity: 'storage_location', id: location.id, operation: 'create', label: location.name });

    return c.json(location, 201);
  })
  .get('/:id', zValidator('param', storageLocationPathParamsModel), async (c) => {
    const location = await StorageLocationsService.read(c.var.household.id, c.req.valid('param').id);

    return c.json(location, 200);
  })
  .patch(
    '/:id',
    zValidator('param', storageLocationPathParamsModel),
    zValidator('json', patchStorageLocationModel),
    async (c) => {
      const { data: location, changeset } = await StorageLocationsService.patch(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );

      c.var.emit({
        entity: 'storage_location',
        id: location.id,
        operation: 'update',
        label: location.name,
        changes: changeset,
      });

      return c.json(location, 200);
    }
  )
  .delete('/:id', zValidator('param', storageLocationPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await StorageLocationsService.delete(c.var.household.id, id);

    // Everything in here went with it. Unlogged: the location's own line stands for all of them.
    c.var.emit(
      { entity: 'storage_location', id, operation: 'delete', label: deleted.name },
      { entity: 'storage_item', id: null, operation: 'delete', label: null }
    );

    return c.json({ success: true }, 202);
  });

export default storageLocationsApp;
