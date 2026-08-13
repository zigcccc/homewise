import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  childDictionaryEntryPathParamsModel,
  childDictionaryPathParamsModel,
  createChildDictionaryEntryModel,
  listChildDictionaryEntriesQueryParamsModel,
  patchChildDictionaryEntryModel,
} from './child-dictionaries.model';
import { ChildDictionariesService } from './child-dictionaries.service';

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
      const dictionaryId = c.req.valid('param').id;
      const entry = await ChildDictionariesService.createEntry(
        household.id,
        dictionaryId,
        c.req.valid('json'),
        user.id
      );

      // The dictionary id, not the entry id, is what subscribers key their queries on.
      c.var.emit({
        entity: 'child_dictionary_entry',
        id: entry.id,
        operation: 'create',
        parentId: dictionaryId,
        label: entry.childPhrase,
      });

      return c.json(entry, 201);
    }
  )
  .patch(
    '/:id/entries/:entryId',
    zValidator('param', childDictionaryEntryPathParamsModel),
    zValidator('json', patchChildDictionaryEntryModel),
    async (c) => {
      const { id, entryId } = c.req.valid('param');
      const { changedFields, ...entry } = await ChildDictionariesService.patchEntry(
        c.var.household.id,
        id,
        entryId,
        c.req.valid('json')
      );

      c.var.emit({
        entity: 'child_dictionary_entry',
        id: entry.id,
        operation: 'update',
        parentId: id,
        label: entry.childPhrase,
        changes: changedFields,
      });

      return c.json(entry, 200);
    }
  )
  .delete('/:id/entries/:entryId', zValidator('param', childDictionaryEntryPathParamsModel), async (c) => {
    const { id, entryId } = c.req.valid('param');
    const deleted = await ChildDictionariesService.deleteEntry(c.var.household.id, id, entryId);

    c.var.emit({
      entity: 'child_dictionary_entry',
      id: entryId,
      operation: 'delete',
      parentId: id,
      label: deleted.childPhrase,
    });

    return c.json({ success: true }, 202);
  });

export default childDictionariesApp;
