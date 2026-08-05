import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { createContactModel } from '../contacts/contacts.model';
import { medicalInfoContactPathParamsModel, medicalInfoPathParamsModel, patchMedicalInfoModel } from './medical.model';
import { MedicalService } from './medical.service';

/**
 * Per-profile medical records. A record's lifecycle belongs to its child/pet profile (created and
 * deleted with it); this app manages the ID number and the attached contacts. Fully collaborative.
 */
const medicalApp = new Hono<AppContext>()
  .use(withHousehold)
  .patch(
    '/:id',
    zValidator('param', medicalInfoPathParamsModel),
    zValidator('json', patchMedicalInfoModel),
    async (c) => {
      const info = await MedicalService.patchInfo(c.var.household.id, c.req.valid('param').id, c.req.valid('json'));

      c.var.emit({ entity: 'medical_info', id: info.id, operation: 'update' });

      return c.json(info, 200);
    }
  )
  .post(
    '/:id/contacts',
    zValidator('param', medicalInfoPathParamsModel),
    zValidator('json', createContactModel),
    async (c) => {
      const id = c.req.valid('param').id;
      const contact = await MedicalService.addContact(c.var.household.id, id, c.req.valid('json'));

      // One request, two effects: a brand new contact in the household's address book, and a record
      // that now points at it.
      c.var.emit(
        { entity: 'contact', id: contact.id, operation: 'create' },
        { entity: 'medical_info', id, operation: 'update' }
      );

      return c.json(contact, 201);
    }
  )
  .post('/:id/contacts/:contactId', zValidator('param', medicalInfoContactPathParamsModel), async (c) => {
    const { id, contactId } = c.req.valid('param');
    const contact = await MedicalService.linkContact(c.var.household.id, id, contactId);

    c.var.emit({ entity: 'medical_info', id, operation: 'update' });

    return c.json(contact, 201);
  })
  .delete('/:id/contacts/:contactId', zValidator('param', medicalInfoContactPathParamsModel), async (c) => {
    const { id, contactId } = c.req.valid('param');
    await MedicalService.unlinkContact(c.var.household.id, id, contactId);

    c.var.emit({ entity: 'medical_info', id, operation: 'update' });

    return c.json({ success: true }, 202);
  });

export default medicalApp;
