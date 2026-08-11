import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import {
  contactPathParamsModel,
  contactRelationPathParamsModel,
  createContactModel,
  createContactRelationModel,
  listContactsQueryParamsModel,
  patchContactModel,
  patchContactRelationModel,
} from './contacts.model';
import { ContactsService } from './contacts.service';

/**
 * The household address book. Contacts are also minted by the features that attach them — medical
 * info creates a doctor, a storage loan creates a borrower — so `ContactsService.create` still takes
 * an executor and those flows stay atomic. This app owns the standalone lifecycle: the listing, the
 * detail record, and the relations between contacts. Fully collaborative.
 *
 * A relation mutation emits for the contact the route names, not for both ends. The web's `contact`
 * invalidator refreshes the whole `['contacts']` prefix and ignores the id, so the far end's page
 * refetches from the one event — a second emit would be the same work announced twice.
 */
const contactsApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', zValidator('query', listContactsQueryParamsModel), async (c) => {
    const contacts = await ContactsService.list(c.var.household.id, c.req.valid('query'));

    return c.json(contacts, 200);
  })
  .post('/', zValidator('json', createContactModel), async (c) => {
    const contact = await ContactsService.create(c.var.household.id, c.req.valid('json'));

    c.var.emit({ entity: 'contact', id: contact.id, operation: 'create' });

    return c.json(contact, 201);
  })
  .get('/:id', zValidator('param', contactPathParamsModel), async (c) => {
    const contact = await ContactsService.read(c.var.household.id, c.req.valid('param').id);

    return c.json(contact, 200);
  })
  .patch('/:id', zValidator('param', contactPathParamsModel), zValidator('json', patchContactModel), async (c) => {
    const contact = await ContactsService.patch(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

    c.var.emit({ entity: 'contact', id: contact.id, operation: 'update' });

    return c.json(contact, 200);
  })
  .delete('/:id', zValidator('param', contactPathParamsModel), async (c) => {
    const { id } = c.req.valid('param');
    await ContactsService.delete(c.var.household.id, id);

    c.var.emit({ entity: 'contact', id, operation: 'delete' });

    return c.json({ success: true }, 202);
  })
  .post(
    '/:id/relations',
    zValidator('param', contactPathParamsModel),
    zValidator('json', createContactRelationModel),
    async (c) => {
      const { id } = c.req.valid('param');
      const contact = await ContactsService.addRelation(c.var.household.id, id, c.req.valid('json'));

      c.var.emit({ entity: 'contact', id, operation: 'update' });

      return c.json(contact, 201);
    }
  )
  .patch(
    '/:id/relations/:relationId',
    zValidator('param', contactRelationPathParamsModel),
    zValidator('json', patchContactRelationModel),
    async (c) => {
      const { id, relationId } = c.req.valid('param');
      const contact = await ContactsService.patchRelation(c.var.household.id, id, relationId, c.req.valid('json'));

      c.var.emit({ entity: 'contact', id, operation: 'update' });

      return c.json(contact, 200);
    }
  )
  .delete('/:id/relations/:relationId', zValidator('param', contactRelationPathParamsModel), async (c) => {
    const { id, relationId } = c.req.valid('param');
    const contact = await ContactsService.removeRelation(c.var.household.id, id, relationId);

    c.var.emit({ entity: 'contact', id, operation: 'update' });

    return c.json(contact, 200);
  });

export default contactsApp;
