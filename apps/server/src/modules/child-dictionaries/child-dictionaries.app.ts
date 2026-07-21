import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { ChildDictionariesService } from './child-dictionaries.service';
import {
  childDictionaryEntryPathParamsModel,
  childDictionaryPathParamsModel,
  createChildDictionaryEntryModel,
  createChildDictionaryModel,
  listChildDictionaryEntriesQueryParamsModel,
  patchChildDictionaryEntryModel,
} from './models';

/**
 * Per-child "baby words" dictionaries. Fully collaborative: any household member can create a
 * dictionary and manage its entries.
 */
const childDictionariesApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', async (c) => {
    const { household } = c.var;
    const dictionaries = await ChildDictionariesService.list(household.id, household.ownerId);

    return c.json(dictionaries, 200);
  })
  .post('/', zValidator('json', createChildDictionaryModel), async (c) => {
    const { household } = c.var;
    const dictionary = await ChildDictionariesService.create(household.id, c.req.valid('json'), household.ownerId);

    return c.json(dictionary, 201);
  })
  .get('/:id', zValidator('param', childDictionaryPathParamsModel), async (c) => {
    const { household } = c.var;
    const dictionary = await ChildDictionariesService.read(household.id, c.req.valid('param').id, household.ownerId);

    return c.json(dictionary, 200);
  })
  .delete('/:id', zValidator('param', childDictionaryPathParamsModel), async (c) => {
    await ChildDictionariesService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  })
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
