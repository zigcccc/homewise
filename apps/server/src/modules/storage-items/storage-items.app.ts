import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  createStorageItemModel,
  lendStorageItemModel,
  listStorageItemsQueryParamsModel,
  patchStorageItemModel,
  storageItemPathParamsModel,
} from './storage-items.model';
import { StorageItemsService } from './storage-items.service';

/**
 * The things in storage. Addressed at the top level rather than under their location, because the
 * question worth asking — "where is the tent" — spans every location at once; `?locationId=` is what
 * narrows the same endpoint down to one place's contents.
 *
 * Writes are multipart, since an item carries a photo. Fully collaborative.
 */
const storageItemsApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listStorageItemsQueryParamsModel), async (c) => {
    const items = await StorageItemsService.list(c.var.household.id, c.req.valid('query'));

    return c.json(items, 200);
  })
  .post('/', zValidator('form', createStorageItemModel), async (c) => {
    const item = await StorageItemsService.create(c.var.household.id, c.req.valid('form'), c.var.user.id);

    c.var.emit({
      entity: 'storage_item',
      id: item.id,
      operation: 'create',
      parentId: item.locationId,
      label: item.name,
    });

    return c.json(item, 201);
  })
  .patch(
    '/:id',
    zValidator('param', storageItemPathParamsModel),
    zValidator('form', patchStorageItemModel),
    async (c) => {
      const { data: item, changeset } = await StorageItemsService.patch(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('form')
      );

      c.var.emit({
        entity: 'storage_item',
        id: item.id,
        operation: 'update',
        parentId: item.locationId,
        label: item.name,
        changes: changeset,
      });

      return c.json(item, 200);
    }
  )
  .post(
    '/:id/loan',
    zValidator('param', storageItemPathParamsModel),
    zValidator('json', lendStorageItemModel),
    async (c) => {
      const {
        data: item,
        changeset,
        createdContact,
      } = await StorageItemsService.lend(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

      c.var.emit({
        entity: 'storage_item',
        id: item.id,
        operation: 'update',
        parentId: item.locationId,
        label: item.name,
        changes: changeset,
      });

      // A new borrower joins the address book. Unlogged: the loan's line above is the whole action.
      if (createdContact) {
        c.var.emit({ entity: 'contact', id: item.loan?.contactId ?? null, operation: 'create', label: null });
      }

      return c.json(item, 200);
    }
  )
  .delete('/:id/loan', zValidator('param', storageItemPathParamsModel), async (c) => {
    const { data: item, changeset } = await StorageItemsService.markReturned(
      c.var.household.id,
      c.req.valid('param').id
    );

    c.var.emit({
      entity: 'storage_item',
      id: item.id,
      operation: 'update',
      parentId: item.locationId,
      label: item.name,
      changes: changeset,
    });

    return c.json(item, 200);
  })
  .delete('/:id', zValidator('param', storageItemPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    const deleted = await StorageItemsService.delete(c.var.household.id, id);

    c.var.emit({
      entity: 'storage_item',
      id,
      operation: 'delete',
      parentId: deleted.locationId,
      label: deleted.name,
    });

    return c.json({ success: true }, 202);
  });

export default storageItemsApp;
