import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { ChildDictionariesService } from './child-dictionaries.service';
import {
  childDictionaryEntryPathParamsModel,
  childDictionaryPathParamsModel,
  createChildDictionaryEntryModel,
  listChildDictionaryEntriesQueryParamsModel,
  patchChildDictionaryEntryModel,
} from './models';

/**
 * Per-child "baby words" dictionaries. A dictionary's lifecycle belongs to its child profile
 * (created and deleted with it); only its entries are managed here. Fully collaborative.
 */
const childDictionariesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get(
    '/:id/entries',
    zValidator('param', childDictionaryPathParamsModel),
    zValidator('query', listChildDictionaryEntriesQueryParamsModel),
    async (c) => {
      const entries = await ChildDictionariesService.listEntries(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('query')
      );

      return c.json(entries, 200);
    }
  )
  .post(
    '/:id/entries',
    zValidator('param', childDictionaryPathParamsModel),
    zValidator('json', createChildDictionaryEntryModel),
    async (c) => {
      const { household, user } = c.var;
      const entry = await ChildDictionariesService.createEntry(
        household.id,
        c.req.valid('param').id,
        c.req.valid('json'),
        user.id
      );

      return c.json(entry, 201);
    }
  )
  .patch(
    '/:id/entries/:entryId',
    zValidator('param', childDictionaryEntryPathParamsModel),
    zValidator('json', patchChildDictionaryEntryModel),
    async (c) => {
      const { id, entryId } = c.req.valid('param');
      const entry = await ChildDictionariesService.patchEntry(c.var.household.id, id, entryId, c.req.valid('json'));

      return c.json(entry, 200);
    }
  )
  .delete('/:id/entries/:entryId', zValidator('param', childDictionaryEntryPathParamsModel), async (c) => {
    const { id, entryId } = c.req.valid('param');
    await ChildDictionariesService.deleteEntry(c.var.household.id, id, entryId);

    return c.json({ success: true }, 202);
  });

export default childDictionariesApp;
