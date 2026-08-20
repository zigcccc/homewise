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
  .use(withHousehold('medicalInfo'))
  .patch(
    '/:id',
    zValidator('param', medicalInfoPathParamsModel),
    zValidator('json', patchMedicalInfoModel),
    async (c) => {
      const { data: info, changeset } = await MedicalService.patchInfo(
        c.var.household.id,
        c.req.valid('param').id,
        c.req.valid('json')
      );
      const owner = await MedicalService.readOwnerDisplayName(c.var.household.id, info.id);

      c.var.emit({ entity: 'medical_info', id: info.id, operation: 'update', label: owner, changes: changeset });

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

      // Two effects, neither logged: attaching a doctor is a detail of the record, not a household event.
      c.var.emit(
        { entity: 'contact', id: contact.id, operation: 'create', label: null },
        { entity: 'medical_info', id, operation: 'update', label: null }
      );

      return c.json(contact, 201);
    }
  )
  .post('/:id/contacts/:contactId', zValidator('param', medicalInfoContactPathParamsModel), async (c) => {
    const { id, contactId } = c.req.valid('param');
    const contact = await MedicalService.linkContact(c.var.household.id, id, contactId);

    c.var.emit({ entity: 'medical_info', id, operation: 'update', label: null });

    return c.json(contact, 201);
  })
  .delete('/:id/contacts/:contactId', zValidator('param', medicalInfoContactPathParamsModel), async (c) => {
    const { id, contactId } = c.req.valid('param');
    await MedicalService.unlinkContact(c.var.household.id, id, contactId);

    c.var.emit({ entity: 'medical_info', id, operation: 'update', label: null });

    return c.json({ success: true }, 202);
  });

export default medicalApp;
