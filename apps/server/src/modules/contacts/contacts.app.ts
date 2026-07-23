import { Hono } from 'hono';

import { zValidator } from '@/lib/validation';
import { withHousehold } from '@/middleware/household.middleware';
import { type AppContext } from '@/types/app.type';

import { ContactsService } from './contacts.service';
import { contactPathParamsModel, patchContactModel } from './models';

/**
 * Standalone household contacts. Creation happens through an owner (e.g. medical info) so the link is
 * atomic; this app owns the generic entity edits. Fully collaborative.
 */
const contactsApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/', async (c) => {
    const contacts = await ContactsService.list(c.var.household.id);

    return c.json(contacts, 200);
  })
  .patch('/:id', zValidator('param', contactPathParamsModel), zValidator('json', patchContactModel), async (c) => {
    const contact = await ContactsService.patch(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

    return c.json(contact, 200);
  })
  .delete('/:id', zValidator('param', contactPathParamsModel), async (c) => {
    await ContactsService.delete(c.var.household.id, c.req.valid('param').id);

    return c.json({ success: true }, 202);
  });

export default contactsApp;
